#!/usr/bin/env node
/**
 * FLOAT VELOCITY BENCHMARK — what 50 testnet tUSD8 can actually buy you.
 *
 * tUSD8 has no market value, so it cannot be "compounded into money". What it
 * CAN do is answer a real engineering question: how much gross settlement can a
 * fixed float support, and what does that cost in gas?
 *
 * Phase 1 — gas scaling across batch sizes 1..100 (channel ESCROW_RELEASE, 1% take)
 * Phase 2 — endurance: 20 round trips of 20 x $1.00 / 20 x $0.99 between two
 *           controlled wallets, so the same float settles 800 payments
 * Phase 3 — pay out all three ledgers, verify the invariant, report velocity
 *
 * The float is NOT consumed: at a 1% take, 99% of every charge comes straight
 * back to the payee. What leaves the working capital is the commission — which
 * lands in the house / referrer / facilitator ledgers. That is the business
 * model, and this script measures it instead of asserting it.
 *
 * Usage: node scripts/float-velocity-benchmark.js [--dry-run] [--quick]
 *
 * After it finishes, run scripts/reconcile-float-benchmark.js: the in-run
 * summary reports the payer wallet only, while the reconcile step sums every
 * address and takes gas from receipts rather than from a balance diff.
 *
 * Requires QDAY_PRIVATE_KEY (testnet). Actors are generated on first run into
 * data/actors.json and reused afterwards.
 */
const fs = require('fs');
const path = require('path');
const {
  JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits,
} = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const { loadKey } = require('./_wallet');

const DEPLOY = path.join(ROOT, 'data', 'deployments', 'qday-capitalmobilizer-v2.json');
const ACTORS = path.join(ROOT, 'data', 'actors.json');
const OUT = path.join(ROOT, 'data', 'deployments', 'float-velocity-benchmark.json');

const RPC = 'https://rpc-test.qday.info';
const CHAIN = 44005;
const EXPLORER = 'https://explorer-test.qday.info';
const TUSD8 = '0x456569838f1d43009A91ebA4263147Afd7233483';

const DRY = process.argv.includes('--dry-run');
const QUICK = process.argv.includes('--quick');

const ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
];

const CH = { ESCROW: 2 }; // 1% take — the low-friction channel, right for float recycling

const usd = v => formatUnits(v, 6);

function loadActors() {
  const j = JSON.parse(fs.readFileSync(ACTORS, 'utf8'));
  let changed = false;
  if (!j.float) {
    const w = Wallet.createRandom();
    j.float = { address: w.address, privateKey: w.privateKey };
    changed = true;
  }
  if (changed) fs.writeFileSync(ACTORS, JSON.stringify(j, null, 2));
  return {
    provider: new Wallet(j.provider.privateKey),
    referrer: new Wallet(j.referrer.privateKey),
    float: new Wallet(j.float.privateKey),
  };
}

const batchPlan = (count, grossEach, payee, referrer) =>
  Array.from({ length: count }, () => ({ channel: CH.ESCROW, payee, gross: grossEach, referrer }));

(async () => {
  const rec = JSON.parse(fs.readFileSync(DEPLOY, 'utf8'));
  const ROUTER = rec.address;
  const kf = { privateKey: loadKey() };

  const provider = new JsonRpcProvider(RPC, CHAIN, { staticNetwork: true });
  const owner = new Wallet(kf.privateKey, provider);
  const actors = loadActors();
  const providerActor = actors.provider.connect(provider);
  const referrerActor = actors.referrer.connect(provider);

  const router = new Contract(ROUTER, rec.abi, owner);
  const routerAsProvider = new Contract(ROUTER, rec.abi, providerActor);
  const token = new Contract(TUSD8, ERC20, owner);

  const houseWallet = await router.houseWallet();
  const treasury = await router.treasury();

  const startBal = await token.balanceOf(owner.address);
  const startGas = await provider.getBalance(owner.address);
  const gasPrice = (await provider.getFeeData()).gasPrice || 1_000_000_000n;

  console.log('\n' + '='.repeat(78));
  console.log('  FLOAT VELOCITY BENCHMARK — OFFICIAL tUSD8 (QDay Aevum 44005)');
  console.log('='.repeat(78));
  console.log('router   :', ROUTER);
  console.log('payer A  :', owner.address, '| float', usd(startBal), 'tUSD8 |', formatUnits(startGas, 18), 'tQDAY');
  console.log('payee B  :', providerActor.address);
  console.log('referrer :', referrerActor.address);
  console.log('house    :', houseWallet);
  console.log('treasury :', treasury);

  const trips = QUICK ? 4 : 20;
  const p1Sizes = QUICK ? [1, 2, 5, 10] : [1, 2, 5, 10, 20, 50, 100];
  const p1Gross = parseUnits('0.05', 6);
  const p1Payments = p1Sizes.reduce((a, n) => a + n, 0);
  const p1Total = p1Gross * BigInt(p1Payments);

  const tripGross = parseUnits('1.00', 6);
  const tripReturn = parseUnits('0.99', 6);
  const p2Payments = trips * 40;
  const p2Total = (tripGross * 20n + tripReturn * 20n) * BigInt(trips);

  const plannedGross = p1Total + p2Total;
  const plannedPayments = p1Payments + p2Payments;

  console.log('\nplan: ' + plannedPayments + ' payments, gross ' + usd(plannedGross) + ' tUSD8');
  console.log('  phase 1: batch sizes ' + p1Sizes.join('/') + ' @ $0.05 = ' + p1Payments + ' payments');
  console.log('  phase 2: ' + trips + ' round trips x (20 x $1.00 + 20 x $0.99) = ' + p2Payments + ' payments');

  if (startBal < tripGross * 2n) throw new Error('float too small for the plan: ' + usd(startBal));
  if (DRY) { console.log('\n--dry-run: nothing broadcast.\n'); return; }

  // ---------- gas for the two acting wallets ----------
  for (const [label, w] of [['B', providerActor], ['referrer', referrerActor]]) {
    const g = await provider.getBalance(w.address);
    if (g < parseUnits('0.3', 18)) {
      const tx = await owner.sendTransaction({ to: w.address, value: parseUnits('1', 18), gasPrice, gasLimit: 21000n });
      await tx.wait(1);
      console.log('funded ' + label + ' with 1 tQDAY ->', tx.hash);
    }
  }

  // ---------- approvals ----------
  for (const [label, w] of [['A', owner], ['B', providerActor]]) {
    const t = new Contract(TUSD8, ERC20, w);
    const al = await t.allowance(w.address, ROUTER);
    if (al < parseUnits('1000', 6)) {
      const tx = await t.approve(ROUTER, 2n ** 200n, { gasLimit: 120000n, gasPrice });
      await tx.wait(1);
      console.log('approve ' + label + ' ->', tx.hash);
    }
  }

  const rows = [];
  let gasSpent = 0n;

  const exec = async (label, payer, payee, count, grossEach, refAddr) => {
    const r = payer === 'A' ? router : routerAsProvider;
    const items = batchPlan(count, grossEach, payee, refAddr);
    const tx = await r.chargeBatch(items, { gasLimit: 8_000_000n, gasPrice });
    const rc = await tx.wait(1);
    gasSpent += rc.gasUsed * gasPrice;
    const per = Number(rc.gasUsed) / count;
    rows.push({
      phase: label, count, grossEach: grossEach.toString(),
      gross: (grossEach * BigInt(count)).toString(),
      txHash: tx.hash, block: rc.blockNumber, gasUsed: rc.gasUsed.toString(), gasPerPayment: Math.round(per),
    });
    return { per, gasUsed: rc.gasUsed, hash: tx.hash };
  };

  // ---------- phase 1: gas scaling ----------
  console.log('\n' + '-'.repeat(78));
  console.log('phase 1 — gas scaling across batch sizes (1% take)');
  for (const n of p1Sizes) {
    const o = await exec('gas-scaling', 'A', providerActor.address, n, p1Gross, referrerActor.address);
    console.log(`  batch ${String(n).padStart(3)}  gas ${String(o.gasUsed).padStart(7)} -> ${String(Math.round(o.per)).padStart(6)}/payment  ${o.hash}`);
  }

  // ---------- phase 2: endurance / float recycling ----------
  console.log('\n' + '-'.repeat(78));
  console.log('phase 2 — endurance: same float, ' + trips + ' round trips');
  const checkpoint = [];
  for (let i = 1; i <= trips; i++) {
    const out = await exec('endurance-out', 'A', providerActor.address, 20, tripGross, referrerActor.address);
    const back = await exec('endurance-back', 'B', owner.address, 20, tripReturn, referrerActor.address);
    if (i % 5 === 0 || i === trips) {
      const bal = await token.balanceOf(ROUTER);
      const acc = await router.accountedBalance();
      checkpoint.push({ trip: i, routerBalance: bal.toString(), accounted: acc.toString(), ok: bal === acc });
      console.log(`  trip ${String(i).padStart(2)}  gas/out ${Math.round(out.per)}  gas/back ${Math.round(back.per)}  invariant ${bal === acc ? 'PASS' : 'FAIL'} (${usd(bal)})`);
    }
  }

  // ---------- phase 3: payouts ----------
  console.log('\n' + '-'.repeat(78));
  console.log('phase 3 — payout all ledgers');
  const houseAcc = await router.houseAccrued();
  const facAcc = await router.facilitatorAccrued();
  const refAcc = await router.referrerAccrued(referrerActor.address);
  console.log('  accrued: house ' + usd(houseAcc) + ' | referrer ' + usd(refAcc) + ' | facilitator ' + usd(facAcc));

  const before = {
    house: await token.balanceOf(houseWallet),
    ref: await token.balanceOf(referrerActor.address),
    tre: await token.balanceOf(treasury),
  };
  const payouts = {};
  if (houseAcc > 0n) { const tx = await router.withdrawHouse({ gasLimit: 250000n, gasPrice }); await tx.wait(1); payouts.withdrawHouse = tx.hash; }
  if (refAcc > 0n) { const tx = await router.payReferrer(referrerActor.address, { gasLimit: 250000n, gasPrice }); await tx.wait(1); payouts.payReferrer = tx.hash; }
  if (facAcc > 0n) { const tx = await router.withdrawFacilitator({ gasLimit: 250000n, gasPrice }); await tx.wait(1); payouts.withdrawFacilitator = tx.hash; }
  for (const [k, v] of Object.entries(payouts)) console.log('  ' + k.padEnd(20), v);

  const gained = {
    house: (await token.balanceOf(houseWallet)) - before.house,
    referrer: (await token.balanceOf(referrerActor.address)) - before.ref,
    treasury: (await token.balanceOf(treasury)) - before.tre,
  };

  // ---------- verification ----------
  const endBal = await token.balanceOf(owner.address);
  const routerBal = await token.balanceOf(ROUTER);
  const accounted = await router.accountedBalance();
  const invariantOk = routerBal === accounted && checkpoint.every(c => c.ok);
  const gs = await router.globalStats();
  const endGas = await provider.getBalance(owner.address);

  const gasUsedTQDAY = startGas - endGas;
  const gasUsedEth = Number(formatUnits(gasUsedTQDAY, 18));
  const grossSettled = p1Total + p2Total;

  console.log('\n' + '='.repeat(78));
  console.log('  RESULT');
  console.log('='.repeat(78));
  console.log('payments settled        : ' + (p1Payments + p2Payments));
  console.log('gross settled           : ' + usd(grossSettled) + ' tUSD8');
  console.log('float at start          : ' + usd(startBal));
  console.log('float at end            : ' + usd(endBal));
  console.log('velocity (gross/float)  : ' + (Number(usd(grossSettled)) / Number(usd(startBal))).toFixed(2) + 'x');
  console.log('float retained          : ' + ((Number(usd(endBal)) / Number(usd(startBal))) * 100).toFixed(2) + '%');
  console.log('commission taken        : ' + usd(gained.house + gained.referrer + gained.treasury));
  console.log('  -> house   ' + usd(gained.house));
  console.log('  -> referrer ' + usd(gained.referrer));
  console.log('  -> treasury ' + usd(gained.treasury));
  console.log('gas spent               : ' + gasUsedEth.toFixed(6) + ' tQDAY');
  console.log('gas per payment         : ' + Math.round(Number(gasUsedTQDAY / gasPrice) / plannedPayments) + ' gas');
  console.log('invariant               : ' + (invariantOk ? 'PASS' : 'FAIL') + ' (router ' + usd(routerBal) + ' == accounted ' + usd(accounted) + ')');
  console.log('lifetime on contract    : ops=' + gs[2] + ' gross=$' + usd(gs[0]) + ' commission=$' + usd(gs[1]));
  console.log('='.repeat(78) + '\n');

  fs.writeFileSync(OUT, JSON.stringify({
    network: 'QDay Aevum Testnet', chainId: CHAIN, explorer: EXPLORER,
    token: { symbol: 'tUSD8', address: TUSD8, official: true },
    router: ROUTER,
    houseWallet, treasury,
    payer: owner.address, payee: providerActor.address, referrer: referrerActor.address,
    note: 'Self-circulated FLOAT VELOCITY benchmark. This is NOT revenue and NOT customer adoption: every charge here has us on both sides of the trade. Its only purpose is to measure gas scaling and how much gross settlement a fixed float can carry on this rail. tUSD8 has no market value.',
    payments: p1Payments + p2Payments,
    grossSettled: grossSettled.toString(),
    startFloat: startBal.toString(),
    endFloat: endBal.toString(),
    velocityX: Number((Number(usd(grossSettled)) / Number(usd(startBal))).toFixed(2)),
    floatRetainedPct: Number(((Number(usd(endBal)) / Number(usd(startBal))) * 100).toFixed(2)),
    commission: {
      total: (gained.house + gained.referrer + gained.treasury).toString(),
      house: gained.house.toString(),
      referrer: gained.referrer.toString(),
      treasury: gained.treasury.toString(),
    },
    gas: { tQDAY: gasUsedTQDAY.toString(), perPayment: Math.round(Number(gasUsedTQDAY / gasPrice) / plannedPayments) },
    payouts, checkpoint, rows,
    invariant: { routerBalance: routerBal.toString(), accounted: accounted.toString(), ok: invariantOk },
    globalStats: { gross: gs[0].toString(), commission: gs[1].toString(), ops: gs[2].toString() },
    at: new Date().toISOString(),
  }, null, 2));

  console.log('record:', OUT, '\n');
  if (!invariantOk) process.exit(1);
})().catch(e => {
  console.error('\nFAILED:', e.shortMessage || e.message);
  if (e.info) console.error(JSON.stringify(e.info).slice(0, 900));
  process.exit(1);
});

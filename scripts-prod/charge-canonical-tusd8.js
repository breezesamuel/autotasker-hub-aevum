#!/usr/bin/env node
/**
 * Run REAL settlements through the canonical CapitalMobilizerV2 using the
 * official tUSD8 token — the first non-harness charges on this deployment.
 *
 * Creates two testnet-only actor wallets (provider + referrer) once, then:
 *   1. approve the router for the amount we intend to spend
 *   2. 3 single charge() calls on channel 0 (x402 data sales, 100% take)
 *   3. 1 chargeBatch() of 10 x $0.05 micropayments
 *   4. 1 charge() on channel 2 (escrow, 1% take) -> payee keeps 99%
 *   5. 1 charge() on channel 5 (insurance, 25% take)
 *   6. withdrawHouse / payReferrer / withdrawFacilitator
 *   7. verify bps arithmetic from Charged events + ledger invariant
 *
 * Usage: node scripts/charge-canonical-tusd8.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const {
  JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits, keccak256, toUtf8Bytes,
} = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const KEYFILE = path.join(ROOT, 'hackathon-qday-private', 'config', 'keys', 'qday-hackathon-wallet.json');
const DEPLOY = path.join(ROOT, 'data', 'deployments', 'qday-capitalmobilizer-v2.json');
const ACTORS = path.join(ROOT, 'data', 'keys', 'testnet-actors.json');
const OUT = path.join(ROOT, 'data', 'deployments', 'canonical-tusd8-settlements.json');

const RPC = 'https://rpc-test.qday.info';
const CHAIN = 44005;
const EXPLORER = 'https://explorer-test.qday.info';
const TUSD8 = '0x456569838f1d43009A91ebA4263147Afd7233483';

const DRY = process.argv.includes('--dry-run');

const ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const usd = v => formatUnits(v, 6);

/** Persistent testnet-only actor wallets so payouts land in accounts we control. */
function actors() {
  if (fs.existsSync(ACTORS)) {
    const j = JSON.parse(fs.readFileSync(ACTORS, 'utf8'));
    return { provider: new Wallet(j.provider.privateKey), referrer: new Wallet(j.referrer.privateKey) };
  }
  const provider = Wallet.createRandom();
  const referrer = Wallet.createRandom();
  fs.mkdirSync(path.dirname(ACTORS), { recursive: true });
  fs.writeFileSync(ACTORS, JSON.stringify({
    note: 'QDay testnet-only actor wallets for settlement proofs. Never use on mainnet.',
    provider: { address: provider.address, privateKey: provider.privateKey },
    referrer: { address: referrer.address, privateKey: referrer.privateKey },
  }, null, 2));
  return { provider, referrer };
}

function findEvent(contract, receipt) {
  for (const log of receipt.logs) {
    try {
      const p = contract.interface.parseLog(log);
      if (p && p.name === 'Charged') return p.args;
    } catch {}
  }
  return null;
}

(async () => {
  const rec = JSON.parse(fs.readFileSync(DEPLOY, 'utf8'));
  const ROUTER = rec.address;
  const ABI = rec.abi;

  const kf = JSON.parse(fs.readFileSync(KEYFILE, 'utf8'));
  const provider = new JsonRpcProvider(RPC, CHAIN, { staticNetwork: true });
  const wallet = new Wallet(kf.privateKey, provider);
  const router = new Contract(ROUTER, ABI, wallet);
  const token = new Contract(TUSD8, ERC20, wallet);
  const { provider: payee, referrer: ref } = actors();

  if (payee.privateKey) payee.connect(provider);
  const refAddr = ref.address;
  const payeeAddr = payee.address;

  const gasPrice = (await provider.getFeeData()).gasPrice || 1_000_000_000n;

  console.log('\n' + '='.repeat(74));
  console.log('  CANONICAL SETTLEMENTS — OFFICIAL tUSD8 (QDay Aevum 44005)');
  console.log('='.repeat(74) + '\n');
  console.log('router   :', ROUTER);
  console.log('token    :', TUSD8, '(official tUSD8)');
  console.log('payer    :', wallet.address);
  console.log('payee    :', payeeAddr, '(provider)');
  console.log('referrer :', refAddr);
  console.log('house    :', await router.houseWallet());
  console.log('treasury :', await router.treasury());

  const bal = await token.balanceOf(wallet.address);
  console.log('\npayer tUSD8 :', usd(bal));
  console.log('payer tQDAY :', formatUnits(await provider.getBalance(wallet.address), 18));
  if (bal === 0n) throw new Error('no tUSD8 to spend');

  // ---------- plan ----------
  const plan = [
    { kind: 'single', ch: 0, amount: '0.05', label: 'DATA_API x402 sale #1' },
    { kind: 'single', ch: 0, amount: '0.05', label: 'DATA_API x402 sale #2' },
    { kind: 'single', ch: 0, amount: '0.05', label: 'DATA_API x402 sale #3' },
    { kind: 'batch',  ch: 0, amount: '0.05', count: 10, label: 'DATA_API batch of 10' },
    { kind: 'single', ch: 2, amount: '1.00', label: 'ESCROW_RELEASE' },
    { kind: 'single', ch: 5, amount: '0.40', label: 'INSURANCE_CLAIMS' },
  ];
  const totalGross = plan.reduce((a, p) => a + parseUnits(p.amount, 6) * BigInt(p.count || 1), 0n);
  console.log('planned gross:', usd(totalGross), 'tUSD8');

  if (bal < totalGross) throw new Error(`insufficient tUSD8: have ${usd(bal)}, need ${usd(totalGross)}`);

  if (DRY) {
    for (const p of plan) console.log('  would charge', p.label, p.amount, p.count ? `x${p.count}` : '');
    console.log('\n--dry-run: stopping before broadcast.\n');
    return;
  }

  // ---------- approve ----------
  const allowance = await token.allowance(wallet.address, ROUTER);
  if (allowance < totalGross) {
    const tx = await token.approve(ROUTER, 2n ** 200n, { gasLimit: 120_000n, gasPrice });
    await tx.wait(1);
    console.log('\napprove  :', tx.hash);
  } else {
    console.log('\napprove  : already sufficient');
  }

  // ---------- execute ----------
  console.log('\n' + '-'.repeat(74));
  const settlements = [];
  for (const p of plan) {
    const gross = parseUnits(p.amount, 6);
    let tx, rc, ev, items = null;

    if (p.kind === 'single') {
      tx = await router.charge(p.ch, payeeAddr, gross, refAddr, { gasLimit: 700_000n, gasPrice });
      rc = await tx.wait(1);
      ev = findEvent(router, rc);
      settlements.push({
        kind: 'single', label: p.label, channel: p.ch, gross: gross.toString(),
        txHash: tx.hash, block: rc.blockNumber, gasUsed: rc.gasUsed.toString(),
        commission: ev.commission.toString(), payeeAmount: ev.payeeAmount.toString(),
        houseAmount: ev.houseAmount.toString(), referrerAmount: ev.referrerAmount.toString(),
        facilitatorAmount: ev.facilitatorAmount.toString(),
      });
      console.log(`${p.label.padEnd(24)} $${p.amount.padStart(6)}  gas ${String(rc.gasUsed).padStart(6)}  payee ${usd(ev.payeeAmount).padStart(9)}  comm ${usd(ev.commission).padStart(8)}`);
    } else {
      items = Array.from({ length: p.count }, () => ({
        channel: p.ch, payee: payeeAddr, gross, referrer: refAddr,
      }));
      tx = await router.chargeBatch(items, { gasLimit: 3_000_000n, gasPrice });
      rc = await tx.wait(1);
      const per = Number(rc.gasUsed) / items.length;
      settlements.push({
        kind: 'batch', label: p.label, channel: p.ch, gross: gross.toString(), count: p.count,
        txHash: tx.hash, block: rc.blockNumber, gasUsed: rc.gasUsed.toString(),
        gasPerPayment: per.toFixed(0),
      });
      console.log(`${p.label.padEnd(24)} $${p.amount.padStart(6)} x${p.count}  gas ${rc.gasUsed} -> ${per.toFixed(0)}/payment`);
    }
    console.log('   tx', tx.hash);
  }

  // ---------- arithmetic check on singles ----------
  console.log('\n' + '-'.repeat(74));
  console.log('bps arithmetic from Charged events:');
  let arithOk = true;
  for (const s of settlements.filter(x => x.kind === 'single')) {
    const g = BigInt(s.gross), c = BigInt(s.commission), py = BigInt(s.payeeAmount),
          h = BigInt(s.houseAmount), r = BigInt(s.referrerAmount), f = BigInt(s.facilitatorAmount);
    const ok = py + c === g && h + r + f === c && py + h + r + f === g;
    if (!ok) arithOk = false;
    console.log(`  ch${s.channel} ${s.label.padEnd(22)} ${ok ? 'OK' : 'MISMATCH'}  (payee ${usd(py)} + comm ${usd(c)} = ${usd(g)})`);
  }

  // ---------- payouts ----------
  console.log('\n' + '-'.repeat(74));
  console.log('payout paths:');
  const houseAcc = await router.houseAccrued();
  const refAcc = await router.referrerAccrued(refAddr);
  const facAcc = await router.facilitatorAccrued();
  console.log('  houseAccrued       ', usd(houseAcc));
  console.log('  referrerAccrued    ', usd(refAcc));
  console.log('  facilitatorAccrued ', usd(facAcc));

  const before = {
    house: await token.balanceOf(await router.houseWallet()),
    ref: await token.balanceOf(refAddr),
    tre: await token.balanceOf(await router.treasury()),
  };
  const payouts = {};

  if (houseAcc > 0n) {
    const tx = await router.withdrawHouse({ gasLimit: 250_000n, gasPrice });
    await tx.wait(1); payouts.withdrawHouse = tx.hash;
    console.log('  withdrawHouse      ', tx.hash);
  }
  if (refAcc > 0n) {
    const tx = await router.payReferrer(refAddr, { gasLimit: 250_000n, gasPrice });
    await tx.wait(1); payouts.payReferrer = tx.hash;
    console.log('  payReferrer        ', tx.hash);
  }
  if (facAcc > 0n) {
    const tx = await router.withdrawFacilitator({ gasLimit: 250_000n, gasPrice });
    await tx.wait(1); payouts.withdrawFacilitator = tx.hash;
    console.log('  withdrawFacilitator', tx.hash);
  }

  const gained = {
    house: (await token.balanceOf(await router.houseWallet())) - before.house,
    referrer: (await token.balanceOf(refAddr)) - before.ref,
    treasury: (await token.balanceOf(await router.treasury())) - before.tre,
    payee: await token.balanceOf(payeeAddr),
  };
  console.log('\n  house wallet  +' + usd(gained.house));
  console.log('  referrer      +' + usd(gained.referrer));
  console.log('  treasury      +' + usd(gained.treasury));
  console.log('  payee total    ' + usd(gained.payee));

  // ---------- invariant ----------
  const routerBal = await token.balanceOf(ROUTER);
  const accounted = await router.accountedBalance();
  const invariantOk = routerBal === accounted;
  console.log('\ninvariant: balance ' + usd(routerBal) + ' == accounted ' + usd(accounted) + ' -> ' + (invariantOk ? 'PASS' : 'FAIL'));

  const gs = await router.globalStats();
  console.log('lifetime : ops=' + gs.ops + ' gross=$' + usd(gs.gross) + ' commission=$' + usd(gs.commission));

  // ---------- persist ----------
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    network: 'QDay Aevum Testnet', chainId: CHAIN, explorer: EXPLORER,
    token: { symbol: 'tUSD8', address: TUSD8, official: true },
    router: ROUTER,
    payer: wallet.address,
    payee: payeeAddr,
    referrer: refAddr,
    houseWallet: await router.houseWallet(),
    treasury: await router.treasury(),
    plan,
    totalGross: totalGross.toString(),
    settlements,
    payouts,
    gained: Object.fromEntries(Object.entries(gained).map(([k, v]) => [k, v.toString()])),
    invariant: { contractBalance: routerBal.toString(), accountedBalance: accounted.toString(), ok: invariantOk },
    globalStats: { ops: gs.ops.toString(), gross: gs.gross.toString(), commission: gs.commission.toString() },
    arithmeticOk: arithOk,
    at: new Date().toISOString(),
  }, null, 2));

  console.log('\nrecord:', OUT);
  console.log('explorer:', EXPLORER + '/address/' + ROUTER);
  console.log('='.repeat(74) + '\n');
  if (!arithOk || !invariantOk) process.exit(1);
})().catch(e => {
  console.error('\nFAILED:', e.shortMessage || e.message);
  if (e.info) console.error(JSON.stringify(e.info).slice(0, 800));
  process.exit(1);
});

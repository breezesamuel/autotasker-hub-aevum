#!/usr/bin/env node
/**
 * Reconcile the float-velocity benchmark against the chain.
 *
 * Two things the first pass got wrong and this fixes:
 *   1. "float at end" only counted one wallet. The float is spread across the
 *      payer, the payee and the three ledgers — all of it is still our float.
 *   2. "gas spent" diffed the payer's tQDAY balance, which also included the
 *      2 tQDAY we sent to the acting wallets. Gas must come from receipts.
 *
 * Writes a `reconciled` block into the benchmark record. Never mutates history.
 */
const fs = require('fs');
const path = require('path');
const { JsonRpcProvider, Contract, formatUnits } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const DEPLOY = path.join(ROOT, 'data', 'deployments', 'qday-capitalmobilizer-v2.json');
const BENCH = path.join(ROOT, 'data', 'deployments', 'float-velocity-benchmark.json');

const RPC = 'https://rpc-test.qday.info';
const CHAIN = 44005;
const TUSD8 = '0x456569838f1d43009A91ebA4263147Afd7233483';
const ERC20 = ['function balanceOf(address) view returns (uint256)'];

const usd = v => formatUnits(v, 6);

(async () => {
  const rec = JSON.parse(fs.readFileSync(DEPLOY, 'utf8'));
  const b = JSON.parse(fs.readFileSync(BENCH, 'utf8'));
  const payments = Number(b.payments);
  const provider = new JsonRpcProvider(RPC, CHAIN, { staticNetwork: true });
  const token = new Contract(TUSD8, ERC20, provider);
  const router = new Contract(rec.address, rec.abi, provider);

  // --- gas from receipts ---
  let gasUsed = 0n;
  let feeWei = 0n;
  const hashes = [...new Set(b.rows.map(r => r.txHash).concat(Object.values(b.payouts)))];
  for (const h of hashes) {
    const r = await provider.getTransactionReceipt(h);
    if (!r) { console.log('missing receipt', h); continue; }
    gasUsed += r.gasUsed;
    feeWei += r.gasUsed * (r.gasPrice ?? r.effectiveGasPrice ?? 0n);
  }
  const effGwei = Number(feeWei) / Number(gasUsed) / 1e9;

  // --- float across every address we control or owe ---
  const house = await router.houseWallet();
  const treasury = await router.treasury();
  const roles = [
    ['payer A', b.payer],
    ['payee B', b.payee],
    ['referrer', b.referrer],
    ['house', house],
    ['treasury', treasury],
  ];
  const holdings = [];
  let totalNow = 0n;
  for (const [name, addr] of roles) {
    const v = await token.balanceOf(addr);
    holdings.push({ name, address: addr, balance: v.toString() });
    totalNow += v;
  }
  const routerBal = await token.balanceOf(rec.address);
  const accounted = await router.accountedBalance();
  totalNow += routerBal;

  const startFloat = BigInt(b.startFloat);
  const gross = BigInt(b.grossSettled);
  const commissionBasis = BigInt(b.commission.total);

  // At start the 50 tUSD8 was 47.95 on the payer plus 2.05 parked across the
  // payee / house / referrer / treasury from the earlier 15-settlement run.
  // tUSD8 never leaves the system: gas is paid in tQDAY, commission stays in
  // the ledgers. So the correct check is conservation, not "how much is left".
  const startTotal = startFloat + 2050000n;
  const conservedPct = Number((Number(usd(totalNow)) / Number(usd(startTotal))) * 100).toFixed(2);
  const systemDelta = totalNow - startTotal;

  console.log('\n' + '='.repeat(74));
  console.log('  RECONCILIATION — float-velocity benchmark');
  console.log('='.repeat(74));
  console.log('txs sampled       :', hashes.length);
  console.log('total gas used    :', gasUsed.toString(), '(' + usd(gasUsed) + ' M)');
  console.log('effective gas px  :', effGwei.toFixed(4), 'gwei');
  console.log('fee paid          :', feeWei.toString(), 'wei  =', Number(formatUnits(feeWei, 18)).toFixed(9), 'tQDAY');
  console.log('fee per payment   :', Math.round(Number(gasUsed) / payments), 'gas');
  console.log('');
  for (const h of holdings) console.log('  ' + h.name.padEnd(10), usd(h.balance).padStart(10), h.address);
  console.log('  ' + 'router'.padEnd(10), usd(routerBal).padStart(10), rec.address);
  console.log('  ' + 'TOTAL'.padEnd(10), usd(totalNow).padStart(10));
  console.log('');
  console.log('float at start    :', usd(startTotal), '(payer ' + usd(startFloat) + ' + 2.05 parked)');
  console.log('float now (all)   :', usd(totalNow), '-> conserved ' + conservedPct + '% (delta ' + usd(systemDelta) + ')');
  console.log('gross settled     :', usd(gross), '-> velocity', (Number(usd(gross)) / Number(usd(startFloat))).toFixed(2) + 'x working float');
  console.log('commission taken  :', usd(commissionBasis), '(left the float, landed in ledgers)');
  console.log('invariant         :', routerBal === accounted ? 'PASS' : 'FAIL');

  const reconciled = {
    measuredAt: new Date().toISOString(),
    correction: 'The first pass reported floatRetainedPct against one wallet only and counted 2 tQDAY of wallet funding as gas. These are the corrected figures from chain state and receipts.',
    gasUsed: gasUsed.toString(),
    effectiveGasPriceGwei: Number(effGwei.toFixed(4)),
    feeWei: feeWei.toString(),
    feeTQDAY: formatUnits(feeWei, 18),
    gasPerPayment: Math.round(Number(gasUsed) / payments),
    holdings,
    floatNow: totalNow.toString(),
    floatAtStartSystem: startTotal.toString(),
    systemConservedPct: Number(conservedPct),
    systemDelta: systemDelta.toString(),
    grossSettled: gross.toString(),
    velocityX: Number((Number(usd(gross)) / Number(usd(startFloat))).toFixed(2)),
    invariant: { routerBalance: routerBal.toString(), accounted: accounted.toString(), ok: routerBal === accounted },
  };

  b.reconciled = reconciled;
  b.supersededFields = ['floatRetainedPct', 'gas.perPayment', 'gas.tQDAY'];
  fs.writeFileSync(BENCH, JSON.stringify(b, null, 2));
  console.log('\nrecord updated:', BENCH, '\n');
  if (!reconciled.invariant.ok) process.exit(1);
})().catch(e => { console.error('FAILED:', e.shortMessage || e.message); process.exit(1); });

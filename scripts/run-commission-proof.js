#!/usr/bin/env node
/**
 * End-to-end on-chain proof of the commission engine (QDay Aevum 44005).
 *
 * 1. Deploy DemoUSD6 (6-dp harness token)
 * 2. Deploy CapitalMobilizerV2 wired to it
 * 3. 5 single charge() calls across different channels
 * 4. 1 chargeBatch() of 20 micropayments -> measures amortized gas
 * 5. Exercise withdrawHouse / payReferrer / withdrawFacilitator
 * 6. Verify bps arithmetic + ledger invariant
 *
 * Everything is real: real signatures, real gas, real state.
 */
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const {
  JsonRpcProvider, Wallet, ContractFactory, Contract,
  formatUnits, parseUnits, keccak256, toUtf8Bytes,
} = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const CONTRACTS = path.join(ROOT, 'contracts');
const { loadKey } = require('./_wallet');
const OUTDIR = path.join(ROOT, 'data', 'deployments');
const RECORD = path.join(OUTDIR, 'qday-commission-proof.json');

const RPC = 'https://rpc-test.qday.info';
const CHAIN = 44005;
const EXPLORER = 'https://explorer-test.qday.info';

const HOUSE = '0x74a9f91763c28571af7a52987f425f62825cf5d8';
const TREASURY = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';

const PROVIDER = '0x' + keccak256(toUtf8Bytes('autotasker-provider-1')).slice(26);
const REFERRER = '0x' + keccak256(toUtf8Bytes('autotasker-referrer-1')).slice(26);

function compileOne(file, name) {
  const source = fs.readFileSync(path.join(CONTRACTS, file), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { [file]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors || []).filter(e => e.severity === 'error');
  if (errs.length) { errs.forEach(e => console.error(e.formattedMessage)); throw new Error('compile failed: ' + file); }
  const c = out.contracts[file][name];
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

const usd = v => formatUnits(v, 6);

(async () => {
  const t0 = Date.now();
  console.log('\n' + '='.repeat(74));
  console.log('  COMMISSION ENGINE — REAL ON-CHAIN PROOF (QDay Aevum 44005)');
  console.log('='.repeat(74) + '\n');

  const kf = { privateKey: loadKey() };
  const provider = new JsonRpcProvider(RPC, CHAIN, { staticNetwork: true });
  const wallet = new Wallet(kf.privateKey, provider);
  const gasPrice = (await provider.getFeeData()).gasPrice || 1_000_000_000n;

  console.log('deployer :', wallet.address);
  console.log('gas      :', formatUnits(await provider.getBalance(wallet.address), 18), 'tQDAY');
  console.log('house    :', HOUSE);
  console.log('treasury :', TREASURY);
  console.log('provider :', PROVIDER);
  console.log('referrer :', REFERRER);

  // 1. token
  console.log('\n[1] Deploy DemoUSD6');
  const tokArt = compileOne('DemoUSD6.sol', 'DemoUSD6');
  const tok = await new ContractFactory(tokArt.abi, tokArt.bytecode, wallet)
    .deploy(parseUnits('1000000', 6), { gasLimit: 1_500_000n, gasPrice });
  const tokTx = tok.deploymentTransaction();
  await tokTx.wait(1);
  const tokenAddr = await tok.getAddress();
  console.log('    token :', tokenAddr, ' tx', tokTx.hash.slice(0, 14) + '...');

  // 2. router
  console.log('\n[2] Deploy CapitalMobilizerV2');
  const rtArt = compileOne('CapitalMobilizerV2.sol', 'CapitalMobilizerV2');
  const router = await new ContractFactory(rtArt.abi, rtArt.bytecode, wallet)
    .deploy(tokenAddr, HOUSE, TREASURY, { gasLimit: 3_200_000n, gasPrice });
  const rtTx = router.deploymentTransaction();
  await rtTx.wait(1);
  const routerAddr = await router.getAddress();
  console.log('    router:', routerAddr, ' tx', rtTx.hash.slice(0, 14) + '...');

  // 3. approve
  const ap = await tok.approve(routerAddr, 2n ** 200n, { gasLimit: 120_000n, gasPrice });
  await ap.wait(1);
  console.log('\n[3] approve tx:', ap.hash.slice(0, 14) + '...  allowance:', usd(await tok.allowance(wallet.address, routerAddr)));

  // 4. individual charges
  const cases = [
    { ch: 0, name: 'DATA_API',           amount: '0.05' },
    { ch: 1, name: 'UNCLAIMED_PROPERTY', amount: '12.34' },
    { ch: 2, name: 'ESCROW_RELEASE',     amount: '250.00' },
    { ch: 5, name: 'INSURANCE_CLAIMS',   amount: '40.00' },
    { ch: 4, name: 'LOYALTY_CONVERSION', amount: '8.00' },
  ];

  console.log('\n[4] charge() — single settlement per tx');
  const rows = [];
  for (const c of cases) {
    const gross = parseUnits(c.amount, 6);
    const tx = await router.charge(c.ch, PROVIDER, gross, REFERRER, { gasLimit: 900_000n, gasPrice });
    const rc = await tx.wait(1);
    let ev;
    for (const log of rc.logs) {
      try { const p = router.interface.parseLog(log); if (p && p.name === 'Charged') ev = p.args; } catch {}
    }
    const row = {
      channel: c.name, amount: c.amount, txHash: tx.hash, block: rc.blockNumber, gasUsed: rc.gasUsed.toString(),
      gross: ev.gross.toString(), commission: ev.commission.toString(), payee: ev.payeeAmount.toString(),
      house: ev.houseAmount.toString(), referrer: ev.referrerAmount.toString(), facilitator: ev.facilitatorAmount.toString(),
    };
    rows.push(row);
    const g = BigInt(row.gross), k = BigInt(row.commission), py = BigInt(row.payee),
          h = BigInt(row.house), rf = BigInt(row.referrer), fc = BigInt(row.facilitator);
    row.sumsOk = py + k === g && h + rf + fc === k && py + k === g;
    console.log(`    ${c.name.padEnd(20)} $${c.amount.padStart(7)}  gas ${String(rc.gasUsed).padStart(6)}  payee ${usd(py).padStart(9)}  comm ${usd(k).padStart(8)}  ${row.sumsOk ? 'OK' : 'BAD'}`);
  }

  // 5. batch micropayments
  console.log('\n[5] chargeBatch() — 20 x $0.05 micropayments in one tx');
  const items = Array.from({ length: 20 }, () => ({
    channel: 0, payee: PROVIDER, gross: parseUnits('0.05', 6), referrer: REFERRER,
  }));
  const btx = await router.chargeBatch(items, { gasLimit: 3_000_000n, gasPrice });
  const brc = await btx.wait(1);
  const per = Number(brc.gasUsed) / items.length;
  console.log(`    batch gas ${brc.gasUsed}  ->  ${per.toFixed(0)} gas per payment  (tx ${btx.hash.slice(0, 14)}...)`);

  const single = Number(rows[0].gasUsed);
  console.log(`    single-charge gas ${single}  ->  batch saves ${(100 * (1 - per / single)).toFixed(1)}% per payment`);

  // 6. payouts
  console.log('\n[6] Payout paths');
  const houseBefore = await tok.balanceOf(HOUSE);
  const refBefore = await tok.balanceOf(REFERRER);
  const treBefore = await tok.balanceOf(TREASURY);
  console.log('    houseAccrued       :', usd(await router.houseAccrued()));
  console.log('    referrerAccrued    :', usd(await router.referrerAccrued(REFERRER)));
  console.log('    facilitatorAccrued :', usd(await router.facilitatorAccrued()));

  const payouts = {};
  if (BigInt(await router.houseAccrued()) > 0n) {
    const t = await router.withdrawHouse({ gasLimit: 200_000n, gasPrice });
    await t.wait(1); payouts.withdrawHouse = t.hash;
    console.log('    withdrawHouse      :', t.hash.slice(0, 18) + '...');
  }
  if (BigInt(await router.referrerAccrued(REFERRER)) > 0n) {
    const t = await router.payReferrer(REFERRER, { gasLimit: 200_000n, gasPrice });
    await t.wait(1); payouts.payReferrer = t.hash;
    console.log('    payReferrer        :', t.hash.slice(0, 18) + '...');
  }
  if (BigInt(await router.facilitatorAccrued()) > 0n) {
    const t = await router.withdrawFacilitator({ gasLimit: 200_000n, gasPrice });
    await t.wait(1); payouts.withdrawFacilitator = t.hash;
    console.log('    withdrawFacilitator:', t.hash.slice(0, 18) + '...');
  }

  const houseGain = (await tok.balanceOf(HOUSE)) - houseBefore;
  const refGain = (await tok.balanceOf(REFERRER)) - refBefore;
  const treGain = (await tok.balanceOf(TREASURY)) - treBefore;
  console.log('\n    house wallet  received ' + usd(houseGain));
  console.log('    referrer      received ' + usd(refGain));
  console.log('    treasury      received ' + usd(treGain));

  // 7. invariant
  const bal = await tok.balanceOf(routerAddr);
  const accounted = await router.accountedBalance();
  const invariantOk = bal === accounted;
  console.log('\n[7] Invariant: balance(' + usd(bal) + ') == accounted(' + usd(accounted) + ') -> ' + (invariantOk ? 'PASS' : 'FAIL'));

  const gs = await router.globalStats();
  console.log('\n[8] Global stats: ops=' + gs.ops + '  gross=$' + usd(gs.gross) + '  commission=$' + usd(gs.commission));

  // 9. persist
  fs.mkdirSync(OUTDIR, { recursive: true });
  const record = {
    network: 'QDay Aevum Testnet', chainId: CHAIN, explorer: EXPLORER,
    token: { name: 'DemoUSD6', address: tokenAddr, txHash: tokTx.hash, decimals: 6, note: 'test harness token, no monetary value' },
    router: { name: 'CapitalMobilizerV2', address: routerAddr, txHash: rtTx.hash },
    counterparties: { provider: PROVIDER, referrer: REFERRER, houseWallet: HOUSE, treasury: TREASURY },
    charges: rows,
    batch: { count: items.length, txHash: btx.hash, gasUsed: brc.gasUsed.toString(), gasPerPayment: per.toFixed(2), singleChargeGas: single, savingsPct: (100 * (1 - per / single)).toFixed(2) },
    payouts: { ...payouts, houseGain: houseGain.toString(), referrerGain: refGain.toString(), treasuryGain: treGain.toString() },
    invariant: { contractBalance: bal.toString(), accountedBalance: accounted.toString(), ok: invariantOk },
    globalStats: { ops: gs.ops.toString(), gross: gs.gross.toString(), commission: gs.commission.toString() },
    arithmeticAllOk: rows.every(r => r.sumsOk),
    generatedAt: new Date().toISOString(), elapsedMs: Date.now() - t0,
  };
  fs.writeFileSync(RECORD, JSON.stringify(record, null, 2));

  const ok = record.arithmeticAllOk && invariantOk;
  console.log('\n' + '='.repeat(74));
  console.log(ok ? '  ALL CHECKS PASSED — REAL SPLITS VERIFIED ON CHAIN' : '  CHECKS FAILED');
  console.log('='.repeat(74));
  console.log('  token  : ' + EXPLORER + '/token/' + tokenAddr);
  console.log('  router : ' + EXPLORER + '/address/' + routerAddr);
  console.log('  record : ' + RECORD);
  console.log('='.repeat(74) + '\n');
  if (!ok) process.exit(1);
})().catch(e => {
  console.error('\nFAILED:', e.shortMessage || e.message);
  if (e.info) console.error(JSON.stringify(e.info, null, 2).slice(0, 1200));
  process.exit(1);
});

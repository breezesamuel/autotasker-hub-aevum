#!/usr/bin/env node
/**
 * Activate the real payout accounts with a live balance and record the hashes.
 * House and treasury currently have zero gas, which makes them look dead on the explorer.
 */
const fs = require('fs');
const path = require('path');
const { JsonRpcProvider, Wallet, formatUnits, parseEther } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const { loadKey } = require('./_wallet');
const OUT = path.join(ROOT, 'data', 'deployments', 'account-activation.json');

const HOUSE = '0x74a9f91763c28571af7a52987f425f62825cf5d8';
const TREASURY = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';

(async () => {
  const provider = new JsonRpcProvider('https://rpc-test.qday.info', 44005, { staticNetwork: true });
  const kf = { privateKey: loadKey() };
  const wallet = new Wallet(kf.privateKey, provider);
  const gasPrice = (await provider.getFeeData()).gasPrice || 1_000_000_000n;

  console.log('from:', wallet.address, formatUnits(await provider.getBalance(wallet.address), 18), 'tQDAY\n');

  const targets = [
    { name: 'houseWallet', address: HOUSE, amount: '1.0', role: '90% commission recipient' },
    { name: 'treasury', address: TREASURY, amount: '1.0', role: '0.5% facilitator fee recipient / x402 payTo' },
  ];

  const results = [];
  for (const t of targets) {
    const before = await provider.getBalance(t.address);
    const tx = await wallet.sendTransaction({ to: t.address, value: parseEther(t.amount), gasLimit: 21000n, gasPrice });
    const rc = await tx.wait(1);
    const after = await provider.getBalance(t.address);
    console.log(`${t.name.padEnd(12)} ${t.address}`);
    console.log(`  ${t.role}`);
    console.log(`  +${formatUnits(after - before, 18)} tQDAY  tx ${tx.hash}  block ${rc.blockNumber}`);
    results.push({ ...t, txHash: tx.hash, block: rc.blockNumber, before: before.toString(), after: after.toString() });
  }

  fs.writeFileSync(OUT, JSON.stringify({
    network: 'QDay Aevum Testnet', chainId: 44005,
    from: wallet.address, transfers: results, at: new Date().toISOString(),
  }, null, 2));
  console.log('\nsaved:', OUT);
})().catch(e => { console.error('FAILED:', e.shortMessage || e.message); process.exit(1); });

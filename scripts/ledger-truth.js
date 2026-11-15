// ledger-truth.js — compact, fast: ledger claims vs on-chain reality.
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const LEDGER = path.resolve(__dirname, '..', 'data', 'payments', 'ledger.json');
const RPC = 'https://mainnet.base.org';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDT = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2';
const W = { house: '0x74a9f91763c28571af7a52987f425f62825cf5d8', treasury: '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03' };

(async () => {
  const led = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const e = led.entries || [];
  const gross = e.reduce((s, x) => s + (Number(x.priceUsd) || 0), 0);
  const house = e.reduce((s, x) => s + (Number(x.commissionHouseUsd) || 0), 0);
  const hashes = [...new Set(e.map((x) => x.txHash).filter(Boolean))];
  console.log('LEDGER');
  console.log('  entries              :', e.length);
  console.log('  claimed gross USD    :', gross.toFixed(2));
  console.log('  claimed commission   :', house.toFixed(2));
  console.log('  distinct txHashes    :', hashes.length);
  console.log('  networks             :', JSON.stringify(e.reduce((a, x) => (a[x.network] = (a[x.network] || 0) + 1, a), {})));
  console.log('  first entry date     :', e.map(x => x.ts).sort()[0], '-> last', e.map(x => x.ts).sort().pop());

  const p = new ethers.JsonRpcProvider(RPC, 8453);
  console.log('\nON-CHAIN VERIFICATION (sample of 8 txHashes, Base mainnet)');
  for (const h of hashes.slice(0, 8)) {
    const tx = await p.getTransaction(h).catch(() => null);
    console.log(`  ${h.slice(0, 20)}…  ${tx ? 'EXISTS block ' + tx.blockNumber : 'NOT FOUND'}`);
  }

  console.log('\nLIVE BALANCES');
  const usdc = new ethers.Contract(USDC, ['function balanceOf(address) view returns (uint256)'], p);
  const usdt = new ethers.Contract(USDT, ['function balanceOf(address) view returns (uint256)'], p);
  let total = 0;
  for (const [n, a] of Object.entries(W)) {
    const u = Number(await usdc.balanceOf(a)) / 1e6;
    const t = Number(await usdt.balanceOf(a).catch(() => 0n)) / 1e6;
    const g = Number(ethers.formatEther(await p.getBalance(a)));
    total += u + t;
    console.log(`  ${n.padEnd(9)} ${a}  USDC ${u}  USDT ${t}  ETH ${g.toFixed(6)}`);
  }
  console.log('\n  REALIZED (on-chain, spendable):', total.toFixed(6), 'USD');
  console.log('  CLAIMED in ledger           :', gross.toFixed(2), 'USD');
  console.log('  UNREALIZED                  :', (gross - total).toFixed(2), 'USD');
})();

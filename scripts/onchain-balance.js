/**
 * onchain-balance.js — Base 主网实查：金库 + 3 个待扫钱包 的 USDC/ETH 余额
 *
 * 公共 RPC（无 key）：https://mainnet.base.org
 * 验证点：账本里"链上可验证"的钱到底在不在链上、gas 够不够扫款
 */
const https = require('https');

const RPC = 'https://mainnet.base.org';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ADDRS = {
  TREASURY: '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C',
  LEGACY_FACILITATOR: '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
  GENESIS_ID: '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38',
  LEGACY_PAYTO: '0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3',
};

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const r = https.request(RPC, {
      method: 'POST', timeout: 25000,
      headers: { 'content-type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          if (j.error) return reject(new Error(JSON.stringify(j.error)));
          resolve(j.result);
        } catch (e) { reject(new Error('bad rpc response: ' + b.slice(0, 200))); }
      });
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('rpc timeout')));
    r.write(body); r.end();
  });
}

function pad(addr) { return addr.replace(/^0x/i, '').toLowerCase().padStart(64, '0'); }
const fmt = (hex) => parseInt(hex, 16) / 1e6; // USDC 6 decimals

(async () => {
  console.log('Base mainnet (chain ' + await rpc('eth_chainId', []) + ') live balances:\n');
  const rows = [];
  for (const [label, addr] of Object.entries(ADDRS)) {
    const usdc = await rpc('eth_call', [{ to: USDC, data: '0x70a08231' + pad(addr) }, 'latest']).catch(e => 'ERR:' + e.message);
    const eth = await rpc('eth_getBalance', [addr, 'latest']).catch(() => '0x0');
    const usdcNum = String(usdc).startsWith('0x') ? fmt(usdc) : NaN;
    const ethNum = parseInt(eth, 16) / 1e18;
    rows.push({ label, addr, usdc: usdcNum, eth: ethNum });
    console.log(
      label.padEnd(19) + ' ' + addr + '\n'
      + '  USDC: ' + (isNaN(usdcNum) ? usdc : usdcNum.toFixed(6)) + '   ETH(gas): ' + ethNum.toFixed(6)
    );
  }
  const sweepTotal = rows.slice(1).reduce((s, r) => s + r.usdc, 0);
  console.log('\n可扫入金库的 USDC 合计（3 个待扫钱包）: $' + sweepTotal.toFixed(6));
  console.log('金库当前 USDC: $' + rows[0].usdc.toFixed(6));
  const noGas = rows.slice(1).filter(r => r.usdc > 0 && r.eth < 0.00015);
  if (noGas.length) console.log('⚠️  缺 gas 的钱包（扫款前需先补 ETH）: ' + noGas.map(r => r.addr.slice(0, 10)).join(', '));
  console.log('\n阈值检查: 金库 ' + (rows[0].usdc >= 10 ? '≥ $10 → 分配器可运行' : '< $10 → 分配 BLOCKED'));
})().catch(e => { console.error('ONCHAIN ERROR:', e.message); process.exit(1); });

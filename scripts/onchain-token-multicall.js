/**
 * onchain-token-multicall.js — Base 主流代币余额逐查（plain eth_call，稳定）
 * 13 tokens × 4 wallets，比 multicall 更稳（不依赖 ABI 手搓）。
 */
const https = require('https');

const RPC = 'https://mainnet.base.org';
const FALLBACKS = ['https://base.publicnode.com', 'https://1rpc.io/base'];
const ADDRS = {
  TREASURY: '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C',
  LEGACY_FACILITATOR: '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
  GENESIS_ID: '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38',
  LEGACY_PAYTO: '0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3',
};
const TOKENS = [
  ['USDC',   '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 6],
  ['USDbC',  '0xd9aAEc86B65D58f6F5Ea539292F5cD90b58f5cD9', 6],
  ['DAI',    '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 18],
  ['WETH',   '0x4200000000000000000000000000000000000006', 18],
  ['cbBTC',  '0xcbB7C0000aB88B473b1f5aFd9ef8084c786B1b1F', 8],
  ['cbETH',  '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', 18],
  ['AERO',   '0x940181a94A35A6368436839582aAc99C7B0f6185', 18],
  ['VIRTUAL','0x0b3e328455c4059F414CD39d5383b1b8A77297D1', 18],
  ['DEGEN',  '0x4ed4E862860beD51A190714c2D8eAF4929bE6693', 18],
  ['BRETT',  '0x532f27101965dd16442E59d40670FaF5eBB142E4', 18],
  ['USDT',   '0xfde4F96e2cbcDB2E4d0D0cB6Ea19e8Daee6fb9C6', 6],
  ['EURC',   '0x60a7E79D2A09f24A7136118401bC7b9E7B41Ad4c', 6],
];

function rpc(url, method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const u = new URL(url);
    const r = https.request({ hostname: u.hostname, path: u.pathname + (u.search || ''), method: 'POST', timeout: 25000,
      headers: { 'content-type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try { const j = JSON.parse(b); j.error ? reject(new Error(JSON.stringify(j.error).slice(0, 100))) : resolve(j.result); }
        catch (e) { reject(new Error('bad rpc ' + b.slice(0, 60))); }
      });
    });
    r.on('error', reject); r.on('timeout', () => r.destroy(new Error('timeout')));
    r.write(body); r.end();
  });
}
async function ethCall(to, data) {
  for (const u of [RPC, ...FALLBACKS]) {
    try { return await rpc(u, 'eth_call', [{ to, data }, 'latest']); } catch (e) { /* try next */ }
  }
  throw new Error('all rpc failed');
}
const pad = (a) => a.replace(/^0x/i, '').toLowerCase().padStart(64, '0');

(async () => {
  for (const [label, addr] of Object.entries(ADDRS)) {
    console.log('── ' + label + ' ' + addr);
    let any = false;
    for (const [sym, token, dec] of TOKENS) {
      try {
        const r = await ethCall(token, '0x70a08231' + pad(addr));
        const raw = BigInt(r);
        if (raw > 0n) {
          any = true;
          console.log('   ' + sym.padEnd(8) + ' ' + (Number(raw) / 10 ** dec).toFixed(6) + '   (' + token + ')');
        }
      } catch (e) { console.log('   ' + sym + ' query failed: ' + e.message.slice(0, 50)); }
    }
    if (!any) console.log('   （主流代币零余额）');
    console.log('');
  }
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });

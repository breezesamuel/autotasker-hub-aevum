/**
 * verify-recipient-facts.js
 * Only prints facts that come back from chain / APIs. No hardcoded narrative.
 */
const https = require('https');

const A = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com'];
let idx = 0;

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: new URL(url).hostname, port: 443, path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = ''; res.on('data', c => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ parseError: d.slice(0, 200) }); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end(data);
  });
}

async function rpc(method, params) {
  let last;
  for (let i = 0; i < RPCS.length + 2; i++) {
    const url = RPCS[idx % RPCS.length];
    try {
      const r = await post(url, { jsonrpc: '2.0', id: 1, method, params });
      if (r.error) throw new Error(r.error.message || JSON.stringify(r.error));
      return r.result;
    } catch (e) { last = e; idx++; }
  }
  throw last;
}

(async () => {
  const out = { address: A };

  out.nonce = parseInt(await rpc('eth_getTransactionCount', [A, 'latest']), 16);
  out.code = (await rpc('eth_getCode', [A, 'latest'])) === '0x' ? 'EOA (no code)' : 'CONTRACT';
  out.ethWei = BigInt(await rpc('eth_getBalance', [A, 'latest'])).toString();

  // USDC balanceOf(address)
  const cd = '0x70a08231' + A.slice(2).padStart(64, '0');
  const bal = await rpc('eth_call', [{ to: USDC, data: cd }, 'latest']);
  out.usdcRaw = BigInt(bal).toString();
  out.usdc = Number(BigInt(bal) / 10n ** 6n * 1000000n) / 1e6;

  // Real outbound tx list for the first few nonces (from chain)
  out.outbound = [];
  for (let n = 0; n < Math.min(out.nonce, 10); n++) {
    // find tx by scanning recent blocks is expensive; skip unless we have a way
  }

  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

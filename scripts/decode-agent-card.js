const https = require('https');
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com'];
let idx = 0;
function post(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({ hostname: new URL(url).hostname, port: 443, path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let d = ''; res.on('data', c => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ parseError: d.slice(0, 200) }); } });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end(data);
  });
}
async function rpc(method, params) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await post(RPCS[idx % RPCS.length], { jsonrpc: '2.0', id: 1, method, params });
      if (r.error) throw new Error(r.error.message || JSON.stringify(r.error));
      return r.result;
    } catch (e) { last = e; idx++; }
  }
  throw last;
}

const TXS = [
  ['2026-09-05T03:29:41Z', '0x2e72beeff1d5e4fb418370704a4bb3fc4c5753f4bc00ebc32c70cd0990f7bce8'],
];

// ABI-decode dynamic string args: strip selector, parse head offsets
function decodeStrings(hex) {
  const body = hex.slice(10);
  const words = body.match(/[0-9a-f]{64}/g) || [];
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const off = parseInt(words[i], 16);
    if (off % 32 !== 0 || off / 32 >= words.length) continue;
    const len = parseInt(words[off / 32], 16);
    if (len <= 0 || len > 4096) continue;
    let data = '';
    for (let w = off / 32 + 1; w <= off / 32 + Math.ceil(len / 32); w++) data += words[w] || '';
    const buf = Buffer.from(data.slice(0, len * 2), 'hex');
    const s = buf.toString('utf8');
    if (/^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(s)) out.push(s);
  }
  return out;
}

(async () => {
  for (const [when, h] of TXS) {
    const tx = await rpc('eth_getTransactionByHash', [h]);
    console.log('=== tx', h.slice(0, 12) + '...', when, '===');
    const strs = decodeStrings(tx.input);
    for (const s of strs) {
      console.log('\n--- string (', s.length, 'chars ) ---');
      if (s.startsWith('data:application/json;base64,')) {
        const json = Buffer.from(s.split(',')[1], 'base64').toString('utf8');
        console.log('DECODED AGENT CARD:');
        try { console.log(JSON.stringify(JSON.parse(json), null, 2)); }
        catch { console.log(json); }
      } else {
        console.log(s);
      }
    }
  }
})().catch(e => console.error('FAILED:', e.message));

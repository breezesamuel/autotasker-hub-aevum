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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
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

(async () => {
  const C = '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432';
  const code = await rpc('eth_getCode', [C, 'latest']);
  console.log('0x8004a169... bytecode length:', code === '0x' ? 'NO CODE' : (code.length - 2) / 2 + ' bytes');
  console.log('  preview:', code.slice(0, 90));

  const txh = '0x2e72beeff1d5e4fb418370704a4bb3fc4c5753f4bc00ebc32c70cd0990f7bce8';
  const tx = await rpc('eth_getTransactionByHash', [txh]);
  console.log('\nhardcoded tx', txh.slice(0, 18) + '...', '=>', tx ? 'EXISTS' : 'NULL (does not exist)');
  if (tx) {
    console.log('  from:', tx.from, '\n  to  :', tx.to);
    const blk = await rpc('eth_getBlockByNumber', [tx.blockNumber, false]);
    console.log('  time:', new Date(parseInt(blk.timestamp, 16) * 1000).toISOString());
  }
})().catch(e => console.error('FAILED:', e.message));

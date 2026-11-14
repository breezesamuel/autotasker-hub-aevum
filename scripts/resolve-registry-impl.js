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

const PROXY = '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432';
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const A = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38';

(async () => {
  const raw = await rpc('eth_getStorageAt', [PROXY, IMPL_SLOT, 'latest']);
  const impl = '0x' + raw.slice(-40);
  console.log('Proxy  :', PROXY);
  console.log('Impl   :', impl);
  const icode = await rpc('eth_getCode', [impl, 'latest']);
  console.log('Impl code length:', (icode.length - 2) / 2, 'bytes');

  // Read the first strings in the implementation bytecode to guess project name
  const ascii = (icode.match(/[ -~]{6,}/g) || []).slice(0, 40);
  console.log('\nReadable strings in implementation bytecode:');
  console.log(ascii.join('\n'));

  // Who has called this contract, and how many times (recent blocks via logs from recipient)
  console.log('\n--- Recipient tx detail ---');
  const txh = '0x2e72beeff1d5e4fb418370704a4bb3fc4c5753f4bc00ebc32c70cd0990f7bce8';
  const tx = await rpc('eth_getTransactionByHash', [txh]);
  console.log('selector:', tx.input.slice(0, 10));
  console.log('input bytes:', (tx.input.length - 2) / 2);
  // decode tail as UTF-8 strings if present
  const hexTail = tx.input.slice(10);
  const parts = hexTail.match(/[0-9a-f]{64}/g) || [];
  console.log('32-byte words:', parts.length);
  console.log('first 6 words:');
  parts.slice(0, 6).forEach((w, i) => {
    const maybeStr = Buffer.from(w, 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`  [${i}] 0x${w.slice(0, 16)}...  ascii="${maybeStr}"`);
  });
  const rec = await rpc('eth_getTransactionReceipt', [txh]);
  console.log('status:', rec.status, 'logs:', rec.logs.length);
  rec.logs.slice(0, 5).forEach((l, i) => console.log(`  log[${i}] ${l.address} topics0=${l.topics[0]?.slice(0, 10)}`));
})().catch(e => console.error('FAILED:', e.message));

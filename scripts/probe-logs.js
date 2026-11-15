// probe-logs.js — which RPC will actually serve eth_getLogs, and with what limits?
const RPCS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
  'https://1rpc.io/base',
  'https://base.meowrpc.com',
  'https://base.blockpi.network/v1/rpc/public',
];
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TREASURY = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

async function call(url, method, params) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

(async () => {
  for (const url of RPCS) {
    try {
      const head = parseInt(await call(url, 'eth_blockNumber', []), 16);
      const out = { url, head };
      // single-address topic, 2000-block window
      try {
        const logs = await call(url, 'eth_getLogs', [{
          address: USDC, fromBlock: '0x' + (head - 2000).toString(16), toBlock: '0x' + head.toString(16),
          topics: [TOPIC, null, pad(TREASURY)],
        }]);
        out.single = `ok ${logs.length} logs`;
      } catch (e) { out.single = 'ERR ' + String(e.message).slice(0, 60); }
      // OR-array topic form
      try {
        const logs = await call(url, 'eth_getLogs', [{
          address: USDC, fromBlock: '0x' + (head - 2000).toString(16), toBlock: '0x' + head.toString(16),
          topics: [TOPIC, null, [pad(TREASURY)]],
        }]);
        out.array = `ok ${logs.length} logs`;
      } catch (e) { out.array = 'ERR ' + String(e.message).slice(0, 60); }
      console.log(JSON.stringify(out));
    } catch (e) {
      console.log(JSON.stringify({ url, error: String(e.message).slice(0, 70) }));
    }
  }
})();

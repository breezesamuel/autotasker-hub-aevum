// probe-archive.js — can we read HISTORICAL token balances? (needed by balance-history.js)
//
// If an RPC keeps archive state, eth_call at an old block number tells us what the
// treasury held at that moment, and a binary search finds the exact block where the
// balance jumped. That turns a 4000-chunk log scan into ~40 calls.
const RPCS = [
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
  'https://1rpc.io/base',
];
const TREASURY = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SEL = '0x70a08231'; // balanceOf(address)

async function call(url, method, params) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

const usdcAt = async (url, block) => {
  const data = SEL + TREASURY.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const hex = await call(url, 'eth_call', [{ to: USDC, data }, '0x' + block.toString(16)]);
  return Number(BigInt(hex)) / 1e6;
};

(async () => {
  for (const url of RPCS) {
    const out = { url };
    try {
      const head = parseInt(await call(url, 'eth_blockNumber', []), 16);
      out.head = head;
      out.now = await usdcAt(url, head);
      try { out.blocksAgo_200k = await usdcAt(url, head - 200000); }
      catch (e) { out.blocksAgo_200k = 'ERR ' + String(e.message).slice(0, 60); }
      try { out.blocksAgo_2M = await usdcAt(url, head - 2000000); }
      catch (e) { out.blocksAgo_2M = 'ERR ' + String(e.message).slice(0, 60); }
      try { out.blocksAgo_10M = await usdcAt(url, head - 10000000); }
      catch (e) { out.blocksAgo_10M = 'ERR ' + String(e.message).slice(0, 60); }
    } catch (e) {
      out.error = String(e.message).slice(0, 80);
    }
    console.log(JSON.stringify(out));
  }
})();

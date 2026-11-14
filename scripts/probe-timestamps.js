// probe-timestamps.js — is the window math in balance-history.js sane?
// base.drpc.org serves archive state; verify with real block timestamps.
const RPC = 'https://base.drpc.org';
const call = async (method, params) => {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
};

(async () => {
  const headHex = await call('eth_blockNumber', []);
  const head = parseInt(headHex, 16);
  const tsOf = async (n) => {
    const b = await call('eth_getBlockByNumber', ['0x' + n.toString(16), false]);
    return { block: n, ts: parseInt(b.timestamp, 16) };
  };
  const now = await tsOf(head);
  console.log(`head block ${now.block}  ts ${new Date(now.ts * 1000).toISOString()}`);
  for (const days of [30, 100, 200, 365, 400]) {
    const block = head - Math.floor(days * 86400 / 2);
    const p = await tsOf(block);
    console.log(`${String(days).padStart(3)}d -> block ${String(block).padStart(9)}  ts ${new Date(p.ts * 1000).toISOString()}`);
  }
  // and the two jump blocks the last run found
  for (const b of [56874916, 56880746]) {
    const p = await tsOf(b);
    console.log(`jump ${b} -> ts ${new Date(p.ts * 1000).toISOString()}`);
  }
})().catch(e => { console.error(e); process.exit(1); });

// probe-token.js — identify the token the treasury has been selling for USDC.
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'];
let rpcIdx = 0;
const TREASURY = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';
const TOKEN = '0xfa6071375b2bc079bf781d51906beee0b6f53b0b'; // seen in the swap tx
const POOL = '0x24235fa9dab948e6fde2d2b369bda08d598e8242';

async function eth(method, params) {
  const order = [RPCS[rpcIdx], ...RPCS.filter((_, i) => i !== rpcIdx)];
  let lastErr = null;
  for (const url of order) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      rpcIdx = RPCS.indexOf(url);
      return j.result;
    } catch (e) {
      lastErr = e;
      if (/rate ?limit|too many|429/i.test(String(e.message))) continue;
      throw e;
    }
  }
  throw lastErr;
}
const call = (to, data) => eth('eth_call', [{ to, data }, 'latest']);
const str = (hex) => {
  try {
    const b = Buffer.from(hex.slice(2), 'hex');
    return b.toString('utf8').replace(/[^\x20-\x7e]/g, '').trim();
  } catch { return ''; }
};
const hexNum = (hex) => BigInt(hex).toString();

(async () => {
  const target = process.argv[2] || TOKEN;
  console.log(`token ${target}`);
  // symbol() 0x95d89b41, decimals() 0x313ce567, name() 0x06fdde03, totalSupply() 0x18160ddd
  const [sym, dec, name, supply, bal, poolBal] = await Promise.all([
    call(target, '0x95d89b41').catch(() => null),
    call(target, '0x313ce567').catch(() => null),
    call(target, '0x06fdde03').catch(() => null),
    call(target, '0x18160ddd').catch(() => null),
    call(target, '0x70a08231' + TREASURY.toLowerCase().replace(/^0x/, '').padStart(64, '0')).catch(() => null),
    call(target, '0x70a08231' + POOL.toLowerCase().replace(/^0x/, '').padStart(64, '0')).catch(() => null),
  ]);
  console.log('  name      ', sym && str(sym.result));
  console.log('  symbol    ', sym && str(sym.result));
  console.log('  name(full)', name && str(name.result));
  console.log('  decimals  ', dec && Number(BigInt(dec.result)));
  if (supply) {
    const d = dec ? 10 ** Number(BigInt(dec.result)) : 1;
    console.log('  supply    ', Number(BigInt(supply.result)) / d);
  }
  if (bal && dec) {
    const d = 10 ** Number(BigInt(dec.result));
    console.log(`  treasury holds ${Number(BigInt(bal.result)) / d}`);
  }
  if (poolBal && dec) {
    const d = 10 ** Number(BigInt(dec.result));
    console.log(`  pool 0x24235fa9…8242 holds ${Number(BigInt(poolBal.result)) / d}`);
  }
  // is the pool actually a V2 pair? token0()/token1() = 0x0dfe1681 / 0xd21220a7
  try {
    const t0 = await call(POOL, '0x0dfe1681');
    const t1 = await call(POOL, '0xd21220a7');
    console.log('  pool token0', '0x' + t0.result.slice(26));
    console.log('  pool token1', '0x' + t1.result.slice(26));
  } catch (e) { console.log('  (not a V2 pair or call failed)'); }
})().catch(e => { console.error(e); process.exit(1); });

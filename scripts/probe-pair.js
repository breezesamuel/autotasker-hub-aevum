// probe-pair.js — identify the V2-style pool 0x24235fa9…8242: token0/token1, reserves.
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'];
let rpcIdx = 0;
const POOL = '0x24235fa9dab948e6fde2d2b369bda08d598e8242';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SOLD = '0xfa6071375b2bc079bf781d51906beee0b6f53b0b';

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
      if (!('result' in j)) throw new Error('no result in response (rpc misbehaving)');
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
const call = async (to, data) => {
  const r = await eth('eth_call', [{ to, data }, 'latest']);
  if (r === undefined || r === null || typeof r !== 'string') throw new Error('no result');
  return r;
};
const str = (hex) => Buffer.from(hex.slice(2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').trim();
const addrOf = (hex) => '0x' + hex.slice(26);

(async () => {
  for (const [label, sel] of [['token0', '0x0dfe1681'], ['token1', '0xd21220a7']]) {
    try { console.log(label, addrOf(await call(POOL, sel))); }
    catch (e) { console.log(label, 'ERR', String(e.message).slice(0, 60)); }
  }
  // getReserves() 0x0902f1ac
  try {
    const r = await call(POOL, '0x0902f1ac');
    const d = r.slice(2);
    console.log('reserves raw', d.slice(0, 64), d.slice(64, 128));
  } catch (e) { console.log('reserves ERR', String(e.message).slice(0, 60)); }
  // metadata of the SOLD token
  for (const [label, sel] of [['symbol', '0x95d89b41'], ['name', '0x06fdde03']]) {
    try { console.log(`SOLD ${label}`, str(await call(SOLD, sel))); }
    catch (e) { console.log(`SOLD ${label}`, 'ERR', String(e.message).slice(0, 60)); }
  }
  // SOLD token totalSupply 0x18160ddd and treasury balance 0x70a08231
  try {
    const ts = await call(SOLD, '0x18160ddd');
    console.log('SOLD totalSupply', BigInt(ts).toString());
  } catch (e) { console.log('SOLD supply ERR', String(e.message).slice(0, 60)); }
  try {
    const bal = await call(SOLD, '0x70a08231' + '367f1b3d8ca90d1e087481a9a40d585bf3451a03'.padStart(64, '0'));
    console.log('SOLD treasury balance', BigInt(bal).toString(), '(18 dec =>', Number(BigInt(bal)) / 1e18, ')');
  } catch (e) { console.log('SOLD balance ERR', String(e.message).slice(0, 60)); }
})().catch(e => { console.error(e); process.exit(1); });

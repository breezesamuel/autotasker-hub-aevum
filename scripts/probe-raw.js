// probe-raw.js — dump raw eth_call responses to see what shape we actually get.
const url = 'https://base.drpc.org';
const POOL = '0x24235fa9dab948e6fde2d2b369bda08d598e8242';

(async () => {
  for (const data of ['0x0dfe1681', '0xd21220a7', '0x0902f1ac']) {
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: POOL, data }, 'latest'] }),
      signal: AbortSignal.timeout(20000),
    });
    console.log(data, 'HTTP', r.status);
    const t = await r.text();
    console.log('  ', t.slice(0, 400));
  }
})();

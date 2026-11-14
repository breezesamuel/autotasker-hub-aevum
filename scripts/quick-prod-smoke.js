/** quick-prod-smoke.js — 生产冒烟测试：所有新增端点 */
const https = require('https');
const get = (p, opts) => new Promise(r => {
  const u = new URL('https://autotasker.highkingflower.com' + p);
  const reqOpts = { hostname: u.hostname, port: 443, path: u.pathname + u.search, rejectUnauthorized: false, ...opts };
  https.get(reqOpts, res => {
    let b = ''; res.on('data', c => b += c);
    res.on('end', () => r({ s: res.statusCode, h: res.headers, b }));
  });
});
(async () => {
  const checks = [];
  const pass = (name, cond) => { checks.push({ name, ok: !!cond }); console.log(cond ? ' [OK]' : ' [FAIL]', name); };
  const s = await get('/api/status'); pass('status 200', s.s === 200 && JSON.parse(s.b).uptimeSeconds > 0);
  const a = await get('/api/alerts/queue'); pass('alerts queue', a.s === 200);
  const w = await get('/.well-known/x402'); pass('x402 discovery', w.s === 200 && /verification/.test(w.b));
  for (const board of ['weiboHot', 'zhihu', 'douban', 'bilibili', 'tieba']) {
    const b = await get('/board/' + board); pass('board/' + board, b.s === 200 && /ItemList/.test(b.b));
  }
  const f = await get('/feed.xml?board=weiboHot'); pass('board RSS weiboHot', f.s === 200 && (f.b.match(/<item>/g)||[]).length >= 5);
  const fb = await get('/feed.xml'); pass('full RSS', fb.s === 200 && (fb.b.match(/<item>/g)||[]).length >= 5);
  const m = await get('/api/metrics'); pass('metrics JSON', m.s === 200 && /settlement/.test(m.b));
  const mHtml = await get('/api/metrics', { headers: { 'accept': 'text/html' } }); pass('metrics HTML (Accept:text/html)', mHtml.s === 200 && /运营仪表盘/.test(mHtml.b));
  const t = await get('/trust'); pass('/trust', t.s === 200);
  const fq = await get('/faq'); pass('/faq', fq.s === 200 && /FAQPage/.test(fq.b));
  const prob = await get('/api/x402/proof'); pass('proof', prob.s === 200);
  const recon = await get('/api/x402/reconcile'); pass('reconcile', recon.s === 200);
  const failed = checks.filter(c => !c.ok);
  console.log(`\n总计: ${checks.length - failed.length}/${checks.length} PASS`);
  process.exit(failed.length === 0 ? 0 : 1);
})();

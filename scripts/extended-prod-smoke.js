/** extended-prod-smoke.js — 测试所有新增端点 */
const https = require('https');
const get = (p, opts) => new Promise(r => {
  const u = new URL('https://autotasker.highkingflower.com' + p);
  const reqOpts = { hostname: u.hostname, port: 443, path: u.pathname + u.search, rejectUnauthorized: false, ...opts };
  https.get(reqOpts, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ s: res.statusCode, h: res.headers, b })); });
});
(async () => {
  const checks = [];
  const pass = (name, cond) => { checks.push({ name, ok: !!cond }); console.log(cond ? ' [OK]' : ' [FAIL]', name); };
  // 原有端点
  const s = await get('/api/status'); pass('status', s.s === 200 && JSON.parse(s.b).uptimeSeconds > 0);
  const a = await get('/api/alerts/queue'); pass('alerts queue', a.s === 200);
  const w = await get('/.well-known/x402'); pass('x402 discovery', w.s === 200 && /verification/.test(w.b));
  for (const b of ['weiboHot','zhihu','douban','bilibili','tieba']) {
    const brd = await get('/board/' + b); pass('board/'+b, brd.s === 200);
  }
  const f = await get('/feed.xml?board=weiboHot'); pass('board RSS', f.s === 200 && (f.b.match(/<item>/g)||[]).length >= 5);
  const m = await get('/api/metrics'); pass('metrics JSON', m.s === 200);
  const mh = await get('/api/metrics', { headers: { accept: 'text/html' } }); pass('metrics HTML', mh.s === 200 && /运营仪表盘/.test(mh.b));
  const t = await get('/trust'); pass('trust', t.s === 200);
  const fq = await get('/faq'); pass('faq', fq.s === 200 && /FAQPage/.test(fq.b));
  const pr = await get('/api/x402/proof'); pass('proof', pr.s === 200);
  const rc = await get('/api/x402/reconcile'); pass('reconcile', rc.s === 200);
  // 新增端点
  const mc = await get('/.well-known/mcp'); pass('mcp discovery', mc.s === 200 && /tools/.test(mc.b));
  const kj = await get('/api/keys/list'); pass('keys list', kj.s === 200 && /keys/.test(kj.b));
  const ks = await get('/api/status'); const sj = JSON.parse(ks.b); pass('status uptime+memory', sj.uptimeSeconds > 0 && sj.memory.rssMb > 0);
  const failed = checks.filter(c => !c.ok);
  console.log(`\n总计: ${checks.length - failed.length}/${checks.length} PASS`);
  process.exit(failed.length === 0 ? 0 : 1);
})();

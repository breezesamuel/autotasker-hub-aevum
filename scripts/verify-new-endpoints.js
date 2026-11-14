/** verify-new-endpoints.js */
const https = require('https');
const get = (p) => new Promise(r => {
  https.get('https://autotasker.highkingflower.com' + p, { rejectUnauthorized: false }, res => {
    let b = ''; res.on('data', c => b += c);
    res.on('end', () => r({ s: res.statusCode, b }));
  });
});
(async () => {
  const s = await get('/api/status');
  const j = JSON.parse(s.b);
  console.log('[status]', j.status, '| uptime=' + j.uptimeSeconds + 's | rss=' + j.memory.rssMb + 'MB | lastSettled=' + j.lastSettledAt);
  const a = await get('/api/alerts/queue');
  console.log('[alerts]', a.b);
  const w = await get('/.well-known/x402');
  const ww = JSON.parse(w.b);
  console.log('[x402] keys=' + Object.keys(ww).join(','), '| verification=' + !!ww.verification, '| bazaar=' + ww.bazaar);
  const f = await get('/feed.xml?board=weiboHot');
  const items = (f.b.match(/<item>/g) || []).length;
  console.log('[board-rss weiboHot]', f.s, '| items=' + items);
  const fAll = await get('/feed.xml');
  const allItems = (fAll.b.match(/<item>/g) || []).length;
  console.log('[feed-all]', fAll.s, '| items=' + allItems);
})();

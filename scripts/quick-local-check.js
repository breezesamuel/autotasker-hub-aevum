/** quick-local-check.js — 本地回归：proof / reconcile / faq / 仪表盘 404 / offer 头部 / trending JSON-LD */
const http = require('http');
const get = (p) => new Promise((r) => {
  http.get('http://127.0.0.1:8795' + p, (res) => {
    let b = ''; res.on('data', (c) => (b += c));
    res.on('end', () => r({ s: res.statusCode, h: res.headers, b }));
  }).on('error', (e) => r({ s: 0, h: {}, b: '', e: e.message }));
});
(async () => {
  const proof = await get('/api/x402/proof');
  console.log('proof:', proof.s, proof.b.slice(0, 180));
  const rec = await get('/api/x402/reconcile');
  console.log('reconcile:', rec.s, rec.b.slice(0, 160));
  const faq = await get('/faq');
  console.log('faq:', faq.s, 'FAQPage=' + /"@type":"FAQPage"/.test(faq.b), 'details=' + (faq.b.match(/<details/g) || []).length);
  const dash = await get('/ref/TESTCODE');
  console.log('dash unknown-code:', dash.s, dash.b.includes('不存在') ? 'ok' : '???');
  const home = await get('/offer.html');
  console.log('offer:', home.s,
    'ogurl=' + /og:url/.test(home.b),
    'tw=' + /twitter:card/.test(home.b),
    'Product=' + /"@type":"Product"/.test(home.b),
    'FAQ=' + /FAQPage/.test(home.b),
    'badge=' + /proofBadge/.test(home.b),
    'faqlink=' + /href="\/faq"/.test(home.b));
  const t = await get('/trending');
  console.log('trending:', t.s, 'ItemList=' + /ItemList/.test(t.b), 'rss=' + /rss\+xml/.test(t.b), 'og=' + /og:url/.test(t.b));
  const trust = await get('/trust');
  console.log('trust:', trust.s, 'reconcileRow=' + /链上对账/.test(trust.b));
  const llms = await get('/llms.txt');
  console.log('llms:', llms.s, 'faq=' + /\/faq/.test(llms.b), 'reconcile=' + /\/api\/x402\/reconcile/.test(llms.b));
  const ok = proof.s === 200 && rec.s === 200 && faq.s === 200 && dash.s === 404 && home.s === 200 && t.s === 200 && trust.s === 200 && llms.s === 200;
  process.exit(ok ? 0 : 1);
})();

/** check-trust-page.js — 验证生产 /trust 页零态与关键字段 */
const https = require('https');
https.get('https://autotasker.highkingflower.com/trust', { rejectUnauthorized: false, timeout: 20000 }, (r) => {
  let b = '';
  r.on('data', (c) => (b += c));
  r.on('end', () => {
    const has = (s) => b.includes(s);
    console.log('status:', r.statusCode);
    console.log('zero-state 试运行中:', has('试运行中'));
    console.log('payTo masked:', has('b9A9E6d9C4') && has('…733C'));
    console.log('policy 30/60/10:', has('30% 储蓄') && has('60% 复利') && has('10% 稳定盘'));
    console.log('audit promises:', has('onAfterSettle') && has('house_e2e'));
    console.log('proof link:', has('/api/x402/proof'));
    console.log('json-ld:', has('application/ld+json'));
    console.log('canonical:', has('rel="canonical"'));
    console.log('len:', b.length);
    process.exit(r.statusCode === 200 && has('30% 储蓄') ? 0 : 1);
  });
}).on('error', (e) => { console.error('ERR', e.message); process.exit(1); });

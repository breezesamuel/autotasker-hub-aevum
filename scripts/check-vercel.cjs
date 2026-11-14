// Quick check: is our Vercel deployment actually live despite timeouts?
const https = require('https');
const urls = [
  'autotasker-hub.vercel.app',
  'autotasker-kyn9q3c2c-solmount.vercel.app',
];
let done = 0;
for (const host of urls) {
  const opts = { hostname: host, path: '/api/status', port: 443, method: 'GET', timeout: 8000 };
  const req = https.request(opts, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log(`✅ ${host}: HTTP ${res.statusCode} | ${(data||'').slice(0,150)}`);
      done++;
    });
  });
  req.on('error', e => { console.log(`❌ ${host}: ERR ${e.message.slice(0,50)}`); done++; });
  req.on('timeout', () => { console.log(`⏱️ ${host}: TIMEOUT`); done++; req.destroy(); });
  req.end();
}
setTimeout(() => { if(done<urls.length) console.log(`partial response (${done}/${urls.length})`); }, 10000);

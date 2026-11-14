var https = require('https');
https.get('https://autotasker.highkingflower.com/api/status', { rejectUnauthorized: false }, res => {
  let b = ''; res.on('data', c => b += c);
  res.on('end', () => console.log('status:', res.statusCode, b.slice(0, 100)));
});

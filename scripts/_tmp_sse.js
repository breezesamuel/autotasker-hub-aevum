var https = require('https');
// Quick SSE header check with very short timeout
var t0 = Date.now();
var req = https.get('https://autotasker.highkingflower.com/api/live/stream', { rejectUnauthorized: false, timeout: 5000 }, function(res) {
  console.log('elapsed:', Date.now()-t0, 'ms');
  console.log('status:', res.statusCode);
  console.log('ct:', res.headers['content-type']);
  console.log('cc:', res.headers['cache-control']);
  // Stop reading after getting headers
  res.destroy();
});
req.on('error', function(e) { console.log('err:', e.code, e.message); });
req.on('timeout', function() { console.log('timeout at', Date.now()-t0, 'ms'); req.destroy(); process.exit(0); });
setTimeout(function() { console.log('manual stop at', Date.now()-t0, 'ms'); process.exit(0); }, 6000);

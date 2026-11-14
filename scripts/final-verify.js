/** final-verify.js — 全量生产验证（不含长连接） */
var https = require('https');
function get(p, ms) {
  ms = ms || 8000;
  return new Promise(function(r) {
    var timedOut = false;
    var req = https.get('https://autotasker.highkingflower.com' + p, { rejectUnauthorized: false, timeout: ms }, function(res) {
      var b = ''; res.on('data', function(c) { b += c; });
      res.on('end', function() { if (!timedOut) r({ s: res.statusCode, h: res.headers, b: b }); });
    });
    req.on('error', function(e) { if (!timedOut) r({ s: 0, h: {}, b: '', e: e.message }); });
    req.on('timeout', function() { timedOut = true; req.destroy(); r({ s: 0, h: {}, b: '', e: 'timeout' }); });
    setTimeout(function() { if (!timedOut) { timedOut = true; req.destroy(); r({ s: 0, h: {}, b: '', e: 'manual_timeout' }); } }, ms + 200);
  });
}
(async function() {
  var checks = [];
  function pass(name, cond) { checks.push({ name: name, ok: !!cond }); console.log(cond ? ' [OK]' : ' [FAIL]', name); }

  var s = await get('/api/status');
  try { var sj = JSON.parse(s.b); pass('status uptime+memory', s.s===200 && sj.uptimeSeconds > 0 && sj.memory.rssMb > 0); } catch(e) { pass('status', false); }

  var live = await get('/live');
  pass('/live HTML', live.s===200 && live.b.indexOf('实时交易直播') >= 0);

  var agent = await get('/agent');
  pass('/agent onboard', agent.s===200 && agent.b.indexOf('Agent') >= 0);

  var trust = await get('/trust');
  pass('/trust', trust.s===200 && trust.b.indexOf('30%') >= 0);

  var lb = await get('/leaderboard');
  pass('/leaderboard HTML', lb.s===200);

  var lbApi = await get('/api/leaderboard');
  pass('/api/leaderboard JSON', lbApi.s===200);

  var blog = await get('/blog/');
  pass('/blog index', blog.s===200);

  var topic404 = await get('/topic/nonexistent-slug-xyz-999');
  pass('/topic unknown -> 404', topic404.s===404);

  // Quick SSE header check (no body read)
  var stream = await get('/api/live/stream', 4000);
  var ct = (stream.h['content-type'] || '');
  pass('/api/live/stream SSE', stream.s===200 && ct.indexOf('event-stream') >= 0);

  var fail = checks.filter(function(c) { return !c.ok; });
  console.log('\nTotal:', checks.length - fail.length, '/', checks.length, 'PASS');
  process.exit(fail.length === 0 ? 0 : 1);
})();

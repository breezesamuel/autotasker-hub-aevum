/** verify-all.js — 全量验证脚本 */
var https = require('https');

function get(p, ms) {
  ms = ms || 8000;
  return new Promise(function(r) {
    var t = false;
    var req = https.get('https://autotasker.highkingflower.com' + p, {rejectUnauthorized:false, timeout:ms}, function(res) {
      var b = ''; res.on('data', function(c){b+=c;});
      res.on('end', function(){if(!t)r({s:res.statusCode,h:res.headers,b:b});});
    });
    req.on('error', function(e){if(!t)r({s:0,h:{},b:'',e:e.message});});
    req.on('timeout', function(){t=true;req.destroy();r({s:0,h:{},b:'',e:'timeout'});});
    setTimeout(function(){if(!t){t=true;req.destroy();r({s:0,h:{},b:'',e:'manual'});}}, ms+300);
  });
}

(async function() {
  var ok = 0, fail = 0;
  function pass(n, c) { if(c){ok++;console.log('[OK] '+n);}else{fail++;console.log('[FAIL] '+n);} }

  // Production endpoint checks
  var s = await get('/api/status');
  try { var sj = JSON.parse(s.b); pass('status uptime+memory', s.s===200 && sj.uptimeSeconds>0 && sj.memory.rssMb>0); } catch(e) { pass('status', false); }

  var live = await get('/live');
  pass('/live HTML', live.s===200 && live.b.indexOf('实时交易直播')>=0);

  var agent = await get('/agent');
  pass('/agent onboard', agent.s===200 && agent.b.indexOf('Agent')>=0);

  var trust = await get('/trust');
  pass('/trust policy', trust.s===200 && trust.b.indexOf('30%')>=0);

  var lb = await get('/leaderboard');
  pass('/leaderboard HTML', lb.s===200);

  var lbApi = await get('/api/leaderboard');
  pass('/api/leaderboard JSON', lbApi.s===200);

  var blog = await get('/blog/');
  pass('/blog index', blog.s===200);

  var dash = await get('/dashboard/0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C');
  pass('/dashboard wallet', dash.s===200);

  var topic404 = await get('/topic/nonexistent-slug-xyz-999');
  pass('/topic unknown->404', topic404.s===404);

  console.log('\nTotal: '+(ok+fail)+' checks, ' + ok + ' PASS, ' + fail + ' FAIL');
  process.exit(fail===0?0:1);
})();

/** verify-growth.js — 验证增长引擎端点 */
var https = require('https');
function get(p) {
  return new Promise(function(r) {
    var req = https.get('https://autotasker.highkingflower.com' + p, {rejectUnauthorized:false, timeout:8000}, function(res) {
      var b = ''; res.on('data', function(c){b+=c;});
      res.on('end', function(){r({s:res.statusCode,b:b});});
    });
    req.on('error', function(e){r({s:0,e:e.message});});
    req.on('timeout', function(){req.destroy();r({s:0,e:'timeout'});});
    setTimeout(function(){req.destroy();r({s:0,e:'manual'});}, 9000);
  });
}
(async function() {
  var tests = [
    ['/api/funnel/stats', 'funnel stats'],
    ['/api/funnel/insights', 'funnel insights'],
    ['/api/ab/config', 'AB config'],
    ['/api/growth/leaderboard', 'growth leaderboard'],
    ['/api/growth/stats', 'growth stats'],
    ['/api/partner/info', 'partner info'],
    ['/en/offer.html', 'EN offer (301)'],
    ['/ja/trending', 'JA trending (301)'],
  ];
  var ok=0, fail=0;
  for (var i=0; i<tests.length; i++) {
    var t = tests[i];
    var r = await get(t[0]);
    var pass = r.s === 200 || r.s === 301;
    if (pass) ok++; else fail++;
    console.log((pass?'[OK]':'[FAIL]')+' '+t[1]+': s='+r.s);
  }
  console.log('\nTotal:',ok+fail,'PASS:',ok,'FAIL:',fail);
  process.exit(fail===0?0:1);
})();

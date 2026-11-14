/** quick-prod-check.js */
var https = require('https');
function get(p, ms) {
  ms = ms || 8000;
  return new Promise(function(r) {
    var t = false;
    var req = https.get('https://autotasker.highkingflower.com' + p, { rejectUnauthorized: false, timeout: ms }, function(res) {
      var b = ''; res.on('data', function(c){ b += c; });
      res.on('end', function(){ if(!t) r({s:res.statusCode, h:res.headers, b:b}); });
    });
    req.on('error', function(e){ if(!t) r({s:0,h:{},b:'',e:e.message}); });
    req.on('timeout', function(){ t=true; req.destroy(); r({s:0,h:{},b:'',e:'timeout'}); });
    setTimeout(function(){ if(!t){t=true;req.destroy();r({s:0,h:{},b:'',e:'manual'});} }, ms+300);
  });
}
(async function(){
  var checks=[];
  function pass(n,c){checks.push({n:n,o:!!c}); console.log(c?' [OK]':' [FAIL]',n);}
  var s=await get('/api/status'); try{var j=JSON.parse(s.b);pass('status uptime',s.s===200&&j.uptimeSeconds>0&&j.memory.rssMb>0);}catch(e){pass('status',false);}
  var live=await get('/live'); pass('/live',live.s===200&&live.b.indexOf('实时交易直播')>=0);
  var agent=await get('/agent'); pass('/agent',agent.s===200&&agent.b.indexOf('Agent')>=0);
  var trust=await get('/trust'); pass('/trust',trust.s===200&&trust.b.indexOf('30%')>=0);
  var lb=await get('/leaderboard'); pass('/leaderboard',lb.s===200);
  var lbApi=await get('/api/leaderboard'); pass('/api/leaderboard JSON',lbApi.s===200);
  var blog=await get('/blog/'); pass('/blog',blog.s===200);
  var dashboard=await get('/dashboard/0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C'); pass('/dashboard',dashboard.s===200);
  var fail=checks.filter(function(c){return !c.o;});
  console.log('\nTotal:',checks.length-fail.length,'/',checks.length,'PASS');
  process.exit(fail.length===0?0:1);
})();

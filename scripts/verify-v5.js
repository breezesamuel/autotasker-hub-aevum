/** verify-v5.js */
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
  var ok=0, fail=0;
  function pass(n,c){if(c){ok++;console.log('[OK] '+n);}else{fail++;console.log('[FAIL] '+n+' s='+get.s);} }
  var s=await get('/api/status'); try{var j=JSON.parse(s.b);pass('status operational',s.s===200&&j.uptimeSeconds>0&&j.memory.rssMb>0);}catch(e){pass('status',false);}
  var part=await get('/partner'); pass('/partner HTML',part.s===200&&part.b.indexOf('合作伙伴')>=0);
  var partApi=await get('/api/partner/info'); pass('/api/partner/info JSON',partApi.s===200&&partApi.b.indexOf('plans')>=0);
  var enOffer=await get('/en/offer.html'); pass('/en/offer.html',enOffer.s===200);
  var jaTrend=await get('/ja/trending'); pass('/ja/trending',jaTrend.s===200);
  var krFaq=await get('/kr/faq'); pass('/kr/faq',krFaq.s===200);
  var live=await get('/live'); pass('/live HTML',live.s===200&&live.b.indexOf('实时交易直播')>=0);
  var lb=await get('/leaderboard'); pass('/leaderboard HTML',lb.s===200);
  var blog=await get('/blog/'); pass('/blog index',blog.s===200);
  var dash=await get('/dashboard/0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C'); pass('/dashboard wallet',dash.s===200);
  var trust=await get('/trust'); pass('/trust policy',trust.s===200&&trust.b.indexOf('30%')>=0);
  var agent=await get('/agent'); pass('/agent onboard',agent.s===200&&agent.b.indexOf('Agent')>=0);
  // API directory
  var dirCheck=await get('/api/x402/hotlist?board=weiboHot&limit=2'); pass('/hotlist sample',dirCheck.s===200||dirCheck.s===402);
  console.log('\nTotal:',ok+fail,'PASS:',ok,'FAIL:',fail);
  process.exit(fail===0?0:1);
})();

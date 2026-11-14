/** final-verify-v5.js — 完整验证 */
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
  function pass(n,c){if(c){ok++;console.log('[OK] '+n);}else{fail++;console.log('[FAIL] '+n+' s='+get.s);}}
  // Core
  var s=await get('/api/status'); try{var j=JSON.parse(s.b);pass('status',s.s===200&&j.uptimeSeconds>0&&j.memory.rssMb>0);}catch(e){pass('status',false);}
  // i18n
  var en=await get('/en/offer.html'); pass('/en/offer.html',en.s===200);
  var ja=await get('/ja/trending'); pass('/ja/trending',ja.s===200);
  var kr=await get('/kr/faq'); pass('/kr/faq',kr.s===200);
  // New modules
  var part=await get('/partner'); pass('/partner',part.s===200&&part.b.indexOf('合作伙伴')>=0);
  var partApi=await get('/api/partner/info'); pass('/api/partner/info',partApi.s===200&&partApi.b.indexOf('plans')>=0);
  var lb=await get('/leaderboard'); pass('/leaderboard',lb.s===200);
  var live=await get('/live'); pass('/live',live.s===200&&live.b.indexOf('实时')>=0);
  var blog=await get('/blog/'); pass('/blog',blog.s===200);
  var dash=await get('/dashboard/0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C'); pass('/dashboard',dash.s===200);
  var trust=await get('/trust'); pass('/trust',trust.s===200&&trust.b.indexOf('30%')>=0);
  var agent=await get('/agent'); pass('/agent',agent.s===200&&agent.b.indexOf('Agent')>=0);
  var faq=await get('/faq'); pass('/faq',faq.s===200&&faq.b.indexOf('FAQPage')>=0);
  var prove=await get('/api/x402/proof'); pass('/proof',prove.s===200);
  var recon=await get('/api/x402/reconcile'); pass('/reconcile',recon.s===200);
  console.log('\nTotal:',ok+fail,'PASS:',ok,'FAIL:',fail);
  process.exit(fail===0?0:1);
})();

/** final-v7.js — 完整生产验证 */
var https = require('https');
function get(p) {
  return new Promise(function(r) {
    var t=false;
    var req=https.get('https://autotasker.highkingflower.com'+p,{rejectUnauthorized:false,timeout:8000},function(res){
      var b=''; res.on('data',function(c){b+=c;});
      res.on('end',function(){if(!t)r({s:res.statusCode,b:b,h:res.headers});});
    });
    req.on('error',function(e){if(!t)r({s:0,h:{},b:'',e:e.message});});
    req.on('timeout',function(){t=true;req.destroy();r({s:0,h:{},b:'',e:'timeout'});});
    setTimeout(function(){if(!t){t=true;req.destroy();r({s:0,h:{},b:'',e:'manual'});}},9000);
  });
}
(async function(){
  var tests=[
    // Core
    ['/api/status','status'],
    ['/offer.html','offer'],
    ['/trending','trending'],
    ['/trust','trust'],
    ['/faq','faq'],
    // i18n (301 redirect is expected and correct)
    ['/en/offer.html','EN offer'],
    ['/ja/trending','JA trending'],
    ['/kr/faq','KR faq'],
    // New v7 modules
    ['/api/pricing/current','pricing current'],
    ['/api/pricing/bundles','pricing bundles'],
    ['/api/health/dashboard','health dashboard'],
    ['/api/payment/demo','payment demo'],
    ['/api/payment/guide/hotlist','payment guide'],
    ['/api/funnel/stats','funnel stats'],
    ['/api/funnel/insights','funnel insights'],
    ['/api/ab/config','AB config'],
    ['/api/growth/leaderboard','growth leaderboard'],
    ['/api/growth/stats','growth stats'],
    ['/partner','partner'],
    ['/leaderboard','leaderboard'],
    ['/live','live'],
    ['/agent','agent'],
    ['/blog/','blog index'],
    ['/dashboard/0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C','dashboard'],
    ['/api/x402/proof','proof'],
    ['/api/x402/reconcile','reconcile'],
    // 404 checks
    ['/topic/nonexistent-xyz','topic 404'],
  ];
  var ok=0,fail=0;
  var i18nRoutes={'/en/offer.html':true,'/ja/trending':true,'/kr/faq':true};
  for(var i=0;i<tests.length;i++){
    var t=tests[i],is301ok=i18nRoutes[t[0]];
    var r=await get(t[0]);
    var pass=is301ok?(r.s===301||r.s===200):((t[1].indexOf('404')>=0)?r.s===404:r.s===200);
    if(pass)ok++;else{fail++;console.log('[FAIL]',t[1],'s='+r.s);}
  }
  console.log('\nTotal:'+tests.length,'PASS:'+ok,'FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

/** verify-v9.js — v9 运营面板 + 软限流 + 内容工厂直连生产站 */
var https = require('https');
function get(p) {
  return new Promise(function(r) {
    var t=false;
    var req=https.get('https://autotasker.highkingflower.com'+p,{rejectUnauthorized:false,timeout:8000},function(res){
      var b=''; res.on('data',function(c){b+=c;});
      res.on('end',function(){if(!t)r({s:res.statusCode,b:b,h:res.headers});});
    });
    req.on('error',function(e){if(!t)r({s:0,e:e.message});});
    req.on('timeout',function(){t=true;req.destroy();r({s:0,e:'timeout'});});
    setTimeout(function(){if(!t){t=true;req.destroy();r({s:0,e:'manual'});}},9000);
  });
}
(async function(){
  var i18n={'/en/offer.html':true,'/ja/trending':true,'/kr/faq':true};
  var tests=[
    // Core
    ['/api/status','status'],
    ['/offer.html','offer'],
    // v7
    ['/api/pricing/current','pricing current'],
    ['/api/health/dashboard','health dashboard'],
    ['/api/payment/demo','payment demo'],
    // v8 fraud
    ['/api/fraud/stats','fraud stats'],
    ['/api/fraud/scan','fraud scan'],
    // v8 trends
    ['/api/trends/predict','trend predict'],
    ['/api/trends/momentum','trend momentum'],
    // v8 content factory
    ['/api/content/stats','content stats'],
    // v9 ops panel
    ['/ops','ops dashboard'],
    // Soft rate limit status
    ['/api/ratelimit/status?wallet=0x000000000000000000000000000000000000DEAD','wallet ratelimit'],
    // Growth
    ['/api/growth/leaderboard','growth lb'],
    ['/api/funnel/stats','funnel stats'],
    // i18n
    ['/en/offer.html','EN offer'],
    ['/ja/trending','JA trending'],
    // 404
    ['/topic/nothing-here-xyz','topic 404'],
  ];
  var ok=0,fail=0;
  for(var i=0;i<tests.length;i++){
    var t=tests[i],is301=i18n[t[0]];
    var r=await get(t[0]);
    var pass=is301?(r.s===301||r.s===200):(t[1].indexOf('404')>=0)?(r.s===404):r.s===200;
    if(pass){ok++;console.log('[OK] '+t[1]+' s='+r.s);}
    else{fail++;console.log('[FAIL] '+t[1]+' expect='+(is301?'301/200':'200/404')+' got='+r.s+' b='+r.b.slice(0,100));}
  }
  console.log('\nTotal:'+tests.length+' PASS:'+ok+' FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

/** verify-v8.js — 全量生产验证：v7收入层+v8欺诈+趋势+内容工厂 */
var https = require('https');
function get(p, method, body) {
  return new Promise(function(r) {
    var t=false;
    var opts = { hostname:'autotasker.highkingflower.com', path:p, rejectUnauthorized:false, timeout:8000 };
    if (method==='POST') {
      opts.method='POST';
      opts.headers={'Content-Type':'application/json'};
    }
    var req=https.request(opts,function(res){
      var b=''; res.on('data',function(c){b+=c;});
      res.on('end',function(){if(!t)r({s:res.statusCode,b:b,h:res.headers});});
    });
    req.on('error',function(e){if(!t)r({s:0,h:{},e:e.message});});
    req.on('timeout',function(){t=true;req.destroy();r({s:0,h:{},e:'timeout'});});
    setTimeout(function(){if(!t){t=true;req.destroy();r({s:0,h:{},e:'manual'});}},9000);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
(async function(){
  var i18n={'/en/offer.html':true,'/ja/trending':true,'/kr/faq':true};
  var tests=[
    // Core
    ['/api/status','status'],
    ['/offer.html','offer'],
    ['/trending','trending'],
    // v7 pricing & health
    ['/api/pricing/current','pricing current'],
    ['/api/pricing/bundles','pricing bundles'],
    ['/api/health/dashboard','health dashboard'],
    ['/api/payment/demo','payment demo'],
    ['/api/payment/guide/hotlist','payment guide'],
    // v8 fraud
    ['/api/fraud/stats','fraud stats'],
    ['/api/fraud/blacklist','fraud blacklist'],
    ['/api/fraud/scan','fraud scan'],
    // v8 trends
    ['/api/trends/momentum','trend momentum'],
    ['/api/trends/predict','trend predict'],
    ['/api/content/stats','content stats'],
    // v7 growth
    ['/api/funnel/stats','funnel stats'],
    ['/api/growth/leaderboard','growth leaderboard'],
    ['/partner','partner'],
    ['/leaderboard','leaderboard'],
    ['/live','live'],
    // 404 checks
    ['/topic/nonexistent-xyz-999','topic 404'],
  ];
  var ok=0,fail=0;
  for(var i=0;i<tests.length;i++){
    var t=tests[i],is301=i18n[t[0]];
    var r=await get(t[0]);
    var pass=is301?(r.s===301||r.s===200):(t[1].indexOf('404')>=0)?(r.s===404):r.s===200;
    if(pass)ok++;else{fail++;console.log('[FAIL] '+t[1]+': s='+r.s);}
  }
  console.log('\nTotal:'+tests.length+' PASS:'+ok+' FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

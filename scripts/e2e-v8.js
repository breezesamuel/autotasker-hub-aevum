/** e2e-v8.js — 端到端：结算+欺诈检测+趋势预测联动 */
var https = require('https');
function req(method, p, body) {
  return new Promise(function(r) {
    var t=false;
    var opts={hostname:'autotasker.highkingflower.com',path:p,rejectUnauthorized:false,timeout:10000};
    if(method==='POST'){opts.method='POST';opts.headers={'Content-Type':'application/json'};}
    var h=https.request(opts,function(res){var b='';res.on('data',function(c){b+=c;});res.on('end',function(){if(!t)r({s:res.statusCode,b:b,h:res.headers});});});
    h.on('error',function(e){if(!t)r({s:0,e:e.message});});
    setTimeout(function(){if(!t){t=true;h.destroy();r({s:0,e:'timeout'});}},11000);
    if(body)h.write(JSON.stringify(body));h.end();
  });
}
(async function(){
  var pass=0,fail=0;
  function check(name,p,expectStatus,body,method) {
    method=method||'GET';body=body||null;
    return req(method,p,body).then(function(r){
      var ok=r.s===expectStatus;
      if(ok){pass++;console.log('[OK] '+name+' s='+r.s);}
      else{fail++;console.log('[FAIL] '+name+' expect='+expectStatus+' got='+r.s+' b='+r.b.slice(0,100));}
      return ok;
    });
  }
  // 1) Core smoke
  await check('status','/api/status',200);
  await check('offer','/offer.html',200);
  await check('pricing','/api/pricing/current',200);
  // 2) Fraud layer
  await check('fraud/stats','/api/fraud/stats',200);
  await check('fraud/blacklist','/api/fraud/blacklist',200);
  await check('fraud/scan','/api/fraud/scan',200);
  // 3) Block a test wallet then verify
  await check('fraud/block-test','/api/fraud/block','POST',{wallet:'0x000000000000000000000000000000000000dead',reason:'e2e-test'},200);
  // 4) Trends
  await check('trend/momentum','/api/trends/momentum',200);
  await check('trend/predict','/api/trends/predict',200);
  await check('trend/train','/api/trends/train','POST',{board:'weiboHot',items:[{title:'test topic',engagement:999}]},200);
  // 5) Content factory
  await check('content/stats','/api/content/stats',200);
  await check('content/gen','/api/content/generate','POST',{topic:{title:'E2E Test Topic',headline:'E2E Test'},board:'weiboHot',lang:'en'},200);
  // 6) Payment UX
  await check('payment/demo','/api/payment/demo',200);
  await check('payment/estimate','/api/payment/estimate','POST',{tool:'hotlist',count:5},200);
  await check('payment/guide','/api/payment/guide/hotlist',200);
  // 7) Health
  await check('health/dashboard','/api/health/dashboard',200);
  // 8) Growth
  await check('growth/leaderboard','/api/growth/leaderboard',200);
  await check('growth/share','/api/growth/share','POST',{code:'TEST-E2E-V8',format:'web'},200);
  // 9) i18n
  await check('EN offer','/en/offer.html',301);
  await check('JA trending','/ja/trending',301);
  // 10) 404
  await check('unknown-topic','/topic/no-such-topic-xyz',404);
  console.log('\nE2E Total:'+((pass)+(fail)),'PASS:'+pass,'FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

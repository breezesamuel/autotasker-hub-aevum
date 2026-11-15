/** e2e-v8-fixed.js — 端到端验证（无shell转义问题） */
var https = require('https');
function req(method, p, body) {
  return new Promise(function(r) {
    var t=false;
    var payload = body ? JSON.stringify(body) : null;
    var opts = {
      hostname:'autotasker.highkingflower.com', path:p,
      rejectUnauthorized:false, timeout:10000, method:method
    };
    if(payload){opts.headers={'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)};}
    var h=https.request(opts,function(res){
      var b=''; res.on('data',function(c){b+=c;});
      res.on('end',function(){if(!t)r({s:res.statusCode,b:b,h:res.headers});});
    });
    h.on('error',function(e){if(!t)r({s:0,e:e.message});});
    setTimeout(function(){if(!t){t=true;h.destroy();r({s:0,e:'timeout'});}},11000);
    if(payload)h.write(payload);
    h.end();
  });
}
async function check(name,p,expectStatus,body,method) {
  method=method||'GET';
  var r=await req(method,p,body);
  var ok=r.s===expectStatus;
  if(ok){console.log('[OK] '+name+' s='+r.s);}
  else{console.log('[FAIL] '+name+' expect='+expectStatus+' got='+r.s+' b='+r.b.slice(0,120));}
  return ok;
}
(async function(){
  var pass=0,fail=0;
  async function run(name,p,exp,body,m){
    var ok=await check(name,p,exp,body,m);
    if(ok)pass++;else fail++;
  }
  // Core
  await run('status','/api/status',200);
  await run('offer','/offer.html',200);
  // v7 pricing & health
  await run('pricing','/api/pricing/current',200);
  await run('bundles','/api/pricing/bundles',200);
  await run('health-dash','/api/health/dashboard',200);
  await run('payment-demo','/api/payment/demo',200);
  await run('payment-guide','/api/payment/guide/hotlist',200);
  // v8 fraud
  await run('fraud-stats','/api/fraud/stats',200);
  await run('fraud-blacklist','/api/fraud/blacklist',200);
  await run('fraud-scan','/api/fraud/scan',200);
  await run('fraud-block','/api/fraud/block',200,
    {wallet:'0x000000000000000000000000000000000000DEAD',reason:'e2e-test'},'POST');
  // v8 trends
  await run('trend-momentum','/api/trends/momentum',200);
  await run('trend-predict','/api/trends/predict',200);
  await run('trend-train','/api/trends/train',200,
    {board:'weiboHot',items:[{title:'AutoTasker v8 test',engagement:9999}]},'POST');
  // v8 content factory
  await run('content-stats','/api/content/stats',200);
  await run('content-gen','/api/content/generate',200,
    {topic:{title:'v8 E2E Test Topic',headline:'Testing multi-lang factory'},board:'weiboHot',lang:'en'},'POST');
  // Payment UX
  await run('payment-estimate','/api/payment/estimate',200,
    {tool:'hotlist',count:5},'POST');
  // Growth
  await run('growth-share','/api/growth/share',200,
    {code:'E2E-V8-TEST-'+Date.now(),format:'web'},'POST');
  await run('growth-lb','/api/growth/leaderboard',200);
  // i18n
  await run('EN-offer','/en/offer.html',301);
  await run('JA-trend','/ja/trending',301);
  // 404
  await run('unknown-topic','/topic/no-such-thing-xyz-999',404);
  console.log('\nE2E Total:'+(pass+fail)+' PASS:'+pass+' FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

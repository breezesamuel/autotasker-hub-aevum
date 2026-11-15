/** verify-v10.js — v10新维度验证 */
var https = require('https');
function get(p) {
  return new Promise(function(r){
    var t=false;
    var req=https.get('https://autotasker.highkingflower.com'+p,{rejectUnauthorized:false,timeout:10000},function(res){
      var b='';res.on('data',function(c){b+=c;});
      res.on('end',function(){if(!t)r({s:res.statusCode,b:b,h:res.headers});});
    });
    req.on('error',function(e){if(!t)r({s:0,e:e.message});});
    setTimeout(function(){if(!t){t=true;req.destroy();r({s:0,e:'timeout'});}},11000);
  });
}
function post(p,body){
  return new Promise(function(r){
    var t=false,payload=JSON.stringify(body||{});
    var opts={hostname:'autotasker.highkingflower.com',path:p,rejectUnauthorized:false,timeout:10000,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}};
    var h=https.request(opts,function(res){var b='';res.on('data',function(c){b+=c;});res.on('end',function(){if(!t)r({s:res.statusCode,b:b,h:res.headers});});});
    h.on('error',function(e){if(!t)r({s:0,e:e.message});});
    setTimeout(function(){if(!t){t=true;h.destroy();r({s:0,e:'timeout'});}},11000);
    h.write(payload);h.end();
  });
}
(async function(){
  var tests=[
    // Core
    ['/api/status','status'],
    // v10 Asset Scanner
    ['/api/assets/summary','asset summary'],
    ['/api/assets/recovery','asset recovery'],
    // v10 Bounty Platform
    ['/api/bounty/list','bounty list'],
    ['/api/bounty/stats','bounty stats'],
    // v10 Gig Rewards / Charity
    ['/api/gig/charity','charity stats'],
    ['/api/gig/leaderboard','gig leaderboard'],
    // v10 Payment Integration Status
    ['/api/pay/alipay','alipay status'],
    ['/api/pay/wechat','wechat status'],
    ['/api/pay/cashback/partners','cashback partners'],
    // v10 TON Games
    ['/api/games/ton','ton games'],
    // v10 Solana
    ['/api/chains/solana/status','solana status'],
    // v10 Dormant Discovery
    ['/api/discover/dormant','dormant discovery'],
    // Ops panel (should contain v10 info)
    ['/ops','ops dashboard'],
    // Existing v7/v8
    ['/api/fraud/stats','fraud stats'],
    ['/api/trends/predict','trend predict'],
    ['/api/content/stats','content stats'],
    ['/api/pricing/current','pricing current'],
    ['/api/health/dashboard','health dashboard'],
    // i18n
    ['/en/offer.html','EN offer'],
  ];
  var ok=0,fail=0;
  for(var i=0;i<tests.length;i++){
    var r=await get(tests[i][0]);
    var pass=r.s===200||(tests[i][1]==='EN offer'&&r.s===301);
    if(pass){ok++;console.log('[OK] '+tests[i][1]+' s='+r.s);}
    else{fail++;console.log('[FAIL] '+tests[i][1]+' expect=200 got='+r.s+' b='+(r.b||'').slice(0,80));}
  }
  console.log('\nTotal:'+tests.length+' PASS:'+ok+' FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

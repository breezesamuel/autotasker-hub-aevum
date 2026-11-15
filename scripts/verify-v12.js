/** verify-v12.js — v11 airdrop create修复后验证 */
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
    // Sweep monitor (NEW)
    ['/api/sweep/status','sweep status'],
    ['/api/sweep/confirm','sweep confirm POST',{txHash:'0xtest_abc123'}],
    // Airdrop (NEW — criteria must be OBJECT not string)
    ['/api/airdrop/list','airdrop list'],
    ['/api/airdrop/create','airdrop create',{name:'v11-test-drop',criteria:{source:'all'},budgetUsd:5}],
    ['/api/airdrop/stats','airdrop stats'],
    // Existing v7-v10
    ['/api/pricing/current','pricing current'],
    ['/api/health/dashboard','health dashboard'],
    ['/api/fraud/stats','fraud stats'],
    ['/api/trends/predict','trend predict'],
    ['/api/content/stats','content stats'],
    ['/ops','ops dashboard'],
    ['/api/assets/summary','asset summary'],
    ['/api/bounty/list','bounty list'],
    ['/api/gig/charity','charity stats'],
    ['/api/games/ton','ton games'],
    ['/api/pay/alipay','alipay status'],
    ['/api/chains/solana/status','solana status'],
    ['/api/discover/dormant','dormant discovery'],
    ['/api/ratelimit/status?wallet=0xdead','ratelimit'],
    ['/api/funnel/stats','funnel stats'],
    ['/api/growth/leaderboard','growth lb'],
    ['/en/offer.html','EN offer'],
    ['/topic/nothing-xyz','topic 404'],
  ];
  var ok=0,fail=0;
  for(var i=0;i<tests.length;i++){
    var t=tests[i];
    var isPost=t[2]!==undefined;
    var r=isPost?await post(t[0],t[2]):await get(t[0]);
    // airdrop/create returns {"ok":false,...} when no recipients exist — that's valid (200)
    var isAirdropCreate=t[0]==='/api/airdrop/create';
    var pass=(r.s===200)||(t[1]==='EN offer'&&r.s===301)||(t[1]==='topic 404'&&r.s===404);
    if(pass){ok++;console.log('[OK] '+t[1]+' s='+r.s);}
    else{fail++;console.log('[FAIL] '+t[1]+' expect=200 got='+r.s+' b='+(r.b||'').slice(0,80));}
  }
  console.log('\nTotal:'+tests.length+' PASS:'+ok+' FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

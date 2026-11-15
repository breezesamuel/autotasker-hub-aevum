/** verify-v11.js — v10+v11 全量验证 */
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
  var i18n={'/en/offer.html':true,'/ja/trending':true};
  var tests=[
    // Core
    ['/api/status','status'],
    // v7 revenue
    ['/api/pricing/current','pricing current'],
    ['/api/health/dashboard','health dashboard'],
    ['/api/payment/demo','payment demo'],
    // v8 fraud + trends + content
    ['/api/fraud/stats','fraud stats'],
    ['/api/trends/predict','trend predict'],
    ['/api/content/stats','content stats'],
    // v9 ops panel
    ['/ops','ops dashboard'],
    // v10 asset scanner
    ['/api/assets/summary','asset summary'],
    ['/api/assets/recovery','asset recovery'],
    // v10 bounty
    ['/api/bounty/list','bounty list'],
    ['/api/bounty/stats','bounty stats'],
    // v10 gig rewards
    ['/api/gig/charity','charity stats'],
    ['/api/gig/leaderboard','gig leaderboard'],
    // v10 payment integration
    ['/api/pay/alipay','alipay status'],
    ['/api/games/ton','ton games'],
    // v10 sweep monitor
    ['/api/sweep/status','sweep status'],
    ['/api/sweep/confirm','sweep confirm POST',{txHash:'0xtest1234'}],
    // v10 airdrop
    ['/api/airdrop/list','airdrop list'],
    ['/api/airdrop/create','airdrop create POST',{name:'test-drop',criteria:'referrals',budgetUsd:5}],
    ['/api/airdrop/stats','airdrop stats'],
    // Existing
    ['/api/funnel/stats','funnel stats'],
    ['/api/growth/leaderboard','growth lb'],
    ['/api/ratelimit/status?wallet=0xdead','ratelimit status'],
    // i18n
    ['/en/offer.html','EN offer'],
    ['/ja/trending','JA trending'],
    // 404
    ['/topic/nothing-xyz-999','topic 404'],
  ];
  var ok=0,fail=0;
  for(var i=0;i<tests.length;i++){
    var t=tests[i];
    var isPost=t[2]!==undefined;
    var r=isPost?await post(t[0],t[2]):await get(t[0]);
    var is301=i18n[t[0]];
    var pass=is301?(r.s===301||r.s===200):(t[1].indexOf('404')>=0)?(r.s===404):r.s===200;
    if(pass){ok++;console.log('[OK] '+t[1]+' s='+r.s);}
    else{fail++;console.log('[FAIL] '+t[1]+' expect='+(is301?'301/200':'200')+' got='+r.s+' b='+(r.b||'').slice(0,80));}
  }
  console.log('\nTotal:'+tests.length+' PASS:'+ok+' FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

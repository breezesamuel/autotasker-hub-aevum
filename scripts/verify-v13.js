/** verify-v13.js — v12 games engine + solana scanner + dormant real-data verification */
var https = require('https');
var BASE = 'autotasker.highkingflower.com';
function get(p) {
  return new Promise(function(r){
    var t=false;
    var req=https.get({hostname:BASE,path:p,rejectUnauthorized:false,timeout:15000},function(res){
      var b='';res.on('data',function(c){b+=c;});
      res.on('end',function(){if(!t)r({s:res.statusCode,b:b});});
    });
    req.on('error',function(e){if(!t)r({s:0,e:e.message});});
    setTimeout(function(){if(!t){t=true;req.destroy();r({s:0,e:'timeout'});}},16000);
  });
}
function post(p,body){
  return new Promise(function(r){
    var t=false,payload=JSON.stringify(body||{});
    var opts={hostname:BASE,path:p,rejectUnauthorized:false,timeout:20000,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}};
    var h=https.request(opts,function(res){var b='';res.on('data',function(c){b+=c;});res.on('end',function(){if(!t)r({s:res.statusCode,b:b});});});
    h.on('error',function(e){if(!t)r({s:0,e:e.message});});
    setTimeout(function(){if(!t){t=true;h.destroy();r({s:0,e:'timeout'});}},21000);
    h.write(payload);h.end();
  });
}
// long-timeout POST: /api/trading/cron may need ~48s (4 data sources × 12s timeout)
function postLong(p,body,ms){
  var T=ms||90000;
  return new Promise(function(r){
    var t=false,payload=JSON.stringify(body||{});
    var opts={hostname:BASE,path:p,rejectUnauthorized:false,timeout:T,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}};
    var h=https.request(opts,function(res){var b='';res.on('data',function(c){b+=c;});res.on('end',function(){if(!t)r({s:res.statusCode,b:b});});});
    h.on('error',function(e){if(!t)r({s:0,e:e.message});});
    setTimeout(function(){if(!t){t=true;h.destroy();r({s:0,e:'timeout'});}},T+1000);
    h.write(payload);h.end();
  });
}
(async function(){
  var results=[];
  function check(name, pass, extra){ results.push({name:name,pass:pass,extra:extra||''}); console.log((pass?'[OK] ':'[FAIL] ')+name+(extra?' | '+extra:'')); }

  // regression
  var r=await get('/api/status'); check('status', r.s===200);
  r=await get('/ops'); check('ops dashboard', r.s===200);
  r=await get('/api/assets/summary'); check('asset summary', r.s===200);
  r=await get('/api/bounty/list'); check('bounty list', r.s===200);
  r=await get('/api/gig/charity'); check('charity', r.s===200);
  r=await get('/api/airdrop/list'); check('airdrop list', r.s===200);
  r=await get('/api/sweep/status'); check('sweep status', r.s===200);
  r=await get('/en/offer.html'); check('EN offer 301', r.s===301||r.s===200);
  r=await get('/topic/nothing-xyz'); check('topic 404', r.s===404);

  // v12: games catalog with seed hash
  r=await get('/api/games/ton');
  var cat={}; try{cat=JSON.parse(r.b);}catch(e){}
  check('games catalog', r.s===200 && Array.isArray(cat.games) && cat.games.length>=3,
    'games='+(cat.games?cat.games.length:0)+' seedHash='+(cat.currentSeedHash?cat.currentSeedHash.slice(0,10)+'…':'none'));

  // v12: play guess-number — per-run wallet so the 24h daily-spin cooldown
  // never makes re-runs fail (wallet is synthetic; games only need 0x + len>=10)
  var W='0xV13' + Date.now().toString(36) + 'VerifyRun';
  r=await post('/api/games/ton/play',{gameId:'guess-number',wallet:W,clientSeed:'v13verify',guess:7});
  var play={}; try{play=JSON.parse(r.b);}catch(e){}
  check('game play', r.s===200 && play.ok===true, 'won='+play.won+' pts='+play.playerPoints+' proof='+(play.fairness?'yes':'NO'));

  // v12: play daily-spin
  r=await post('/api/games/ton/play',{gameId:'daily-spin',wallet:W,clientSeed:'v13verify'});
  var spin={}; try{spin=JSON.parse(r.b);}catch(e){}
  check('daily spin', r.s===200 && spin.ok===true, 'awarded='+spin.pointsAwarded);

  // v12: cooldown enforcement
  r=await post('/api/games/ton/play',{gameId:'daily-spin',wallet:W,clientSeed:'v13verify'});
  var cd={}; try{cd=JSON.parse(r.b);}catch(e){}
  check('spin cooldown', r.s===200 && cd.ok===false && cd.reason==='cooldown');

  // v12: verify fairness of the play
  r=await get('/api/games/verify/'+encodeURIComponent(play.playId||'none'));
  var vf={}; try{vf=JSON.parse(r.b);}catch(e){}
  check('fairness verify', r.s===200 && vf.verdict==='VERIFIED FAIR', 'verdict='+(vf.verdict||r.b.slice(0,40)));

  // v12: leaderboard
  r=await get('/api/games/leaderboard');
  var lb={}; try{lb=JSON.parse(r.b);}catch(e){}
  check('games leaderboard', r.s===200 && Array.isArray(lb.leaderboard), 'entries='+((lb.leaderboard||[]).length));

  // v12: profile
  r=await get('/api/games/profile/'+W);
  var pf={}; try{pf=JSON.parse(r.b);}catch(e){}
  check('game profile', r.s===200 && pf.ok===true, 'points='+pf.points);

  // v12: solana scan (single known address)
  r=await get('/api/chains/solana/scan?address=5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9');
  var sol={}; try{sol=JSON.parse(r.b);}catch(e){}
  check('solana scan GET', r.s===200 && sol.ok===true, 'usdc='+(sol.summary?sol.summary.totalUsdc.toFixed(2):'?')+' sol='+(sol.summary?sol.summary.totalSol.toFixed(3):'?'));

  // v12: solana scan POST multi
  r=await post('/api/chains/solana/scan',{wallets:['5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9']});
  check('solana scan POST', r.s===200 && r.b.indexOf('"ok":true')>=0);

  // v12: dormant now real
  r=await get('/api/discover/dormant');
  var dorm={}; try{dorm=JSON.parse(r.b);}catch(e){}
  check('dormant live data', r.s===200 && dorm.status==='live', 'usdc='+(dorm.totals?dorm.totals.usdc:'?')+' eth='+(dorm.totals?dorm.totals.eth:'?'));

  // v13: attribution report
  r=await get('/api/attribution/report');
  var att={}; try{att=JSON.parse(r.b);}catch(e){}
  check('attribution report', r.s===200 && att.stats && typeof att.stats==='object', 'touches='+((att.stats&&att.stats.totalTouches)||0)+' settlements='+((att.stats&&att.stats.totalSettlements)||0));

  // v13: pricing bandit report
  r=await get('/api/pricing/bandit');
  var bd={}; try{bd=JSON.parse(r.b);}catch(e){}
  check('pricing bandit', r.s===200 && Array.isArray(bd.tools), 'tools='+((bd.tools||[]).length)+' conversions='+(((bd.stats||{}).totalConversions)||0));

  // v13: sweep-monitor dormant sync (trigger forces a runScan which now reads dormant-assets.json)
  await post('/api/sweep/trigger',{});
  r=await get('/api/sweep/status');
  var sw={}; try{sw=JSON.parse(r.b);}catch(e){}
  check('sweep dormant sync', r.s===200 && Number(sw.dormantAssetsUsd)>0, 'dormantUsd='+(sw.dormantAssetsUsd!=null?sw.dormantAssetsUsd:'?'));

  // v14: bounty matching engine
  var MW='0xV14Match' + Date.now().toString(36) + 'Worker';
  r=await post('/api/bounty/register-worker',{wallet:MW,skills:['translation','seo'],categories:['content']});
  var reg={}; try{reg=JSON.parse(r.b);}catch(e){}
  check('v14 register worker', r.s===200 && r.b.indexOf('"ok":true')>=0, 'rep='+(reg.profile?reg.profile.reputation:'?'));
  r=await get('/api/bounty/worker/'+MW);
  check('v14 worker profile', r.s===200 && r.b.indexOf('"ok":true')>=0);
  r=await post('/api/bounty/rate',{wallet:MW,rating:5});
  check('v14 rate worker', r.s===200 && r.b.indexOf('"ok":true')>=0);
  r=await post('/api/bounty/bump-stale',{});
  check('v14 bump stale', r.s===200 && r.b.indexOf('"ok":true')>=0);
  r=await get('/api/bounty/matching/report');
  var mr={}; try{mr=JSON.parse(r.b);}catch(e){}
  check('v14 matching report', r.s===200 && mr.stats && typeof mr.stats.workersRegistered==='number', 'workers='+((mr.workers||{}).total));

  // v14: social queue
  r=await post('/api/social/generate',{});
  check('v14 social generate', r.s===200, r.b.slice(0,60));
  r=await get('/api/social/queue');
  var sq2={}; try{sq2=JSON.parse(r.b);}catch(e){}
  check('v14 social queue list', r.s===200 && Array.isArray(sq2.drafts), 'drafts='+((sq2.drafts||[]).length));
  r=await get('/api/social/report');
  check('v14 social report', r.s===200 && r.b.indexOf('"stats"')>=0);

  // v16: paper trading decision loop
  r=await get('/api/trading/report');
  var tr16={}; try{tr16=JSON.parse(r.b);}catch(e){}
  check('v16 trading report', r.s===200 && tr16.account && tr16.stats && tr16.mode==='paper', 'equity='+((tr16.account||{}).equityUsd));
  r=await get('/api/trading/policy');
  check('v16 edge policy', r.s===200 && r.b.indexOf('"objective"')>=0);
  r=await post('/api/trading/gate',{category:'momentum-probe',thesis:{category:'momentum-probe',asset:'BTC',side:'long',confidence:0.4,thesis:'verify script dry-run probe with a stop',hasStop:true,plannedRiskPct:1,actualRiskPct:1,entryRef:90000}});
  var gDec=''; try{gDec=JSON.parse(r.b||'{}').decision||'';}catch(e){}
  check('v16 gate dry-run', r.s===200 && /ALLOWED|MANUAL_REVIEW|COOLDOWN|BLOCKED|HALTED/.test(gDec), gDec);
  r=await postLong('/api/trading/cron',{});
  check('v16 trading cron', r.s===200 && (r.b.indexOf('"ok":true')>=0 || r.b.indexOf('rate-limited')>=0), r.b.slice(0,80));

  var pass=0,fail=0;
  for(var i=0;i<results.length;i++){ if(results[i].pass)pass++; else fail++; }
  console.log('\nTotal:'+results.length+' PASS:'+pass+' FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

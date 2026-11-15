/** verify-v7.js */
var https = require('https');
function get(p) {
  return new Promise(function(r) {
    var t=false, req=https.get('https://autotasker.highkingflower.com'+p,{rejectUnauthorized:false,timeout:8000},function(res){
      var b=''; res.on('data',function(c){b+=c;});
      res.on('end',function(){if(!t)r({s:res.statusCode,b:b});});
    });
    req.on('error',function(e){if(!t)r({s:0,e:e.message});});
    req.on('timeout',function(){t=true;req.destroy();r({s:0,e:'timeout'});});
    setTimeout(function(){if(!t){t=true;req.destroy();r({s:0,e:'manual'});}},9000);
  });
}
(async function(){
  var tests=[
    ['/api/pricing/current','pricing current'],
    ['/api/pricing/bundles','pricing bundles'],
    ['/api/health/dashboard','health dashboard'],
    ['/api/payment/demo','payment demo'],
    ['/api/payment/guide/hotlist','payment guide'],
    ['/api/funnel/stats','funnel stats'],
    ['/api/status','status'],
    ['/partner','partner'],
    ['/leaderboard','leaderboard'],
    ['/en/offer.html','EN offer'],
  ];
  var ok=0,fail=0;
  for(var i=0;i<tests.length;i++){
    var t=tests[i],r=await get(t[0]);
    var pass=r.s===200||r.s===301;
    if(pass)ok++;else fail++;
    console.log((pass?'[OK]':'[FAIL]')+' '+t[1]+': s='+r.s);
  }
  console.log('\nTotal:'+ok+fail,'PASS:'+ok,'FAIL:'+fail);
  process.exit(fail===0?0:1);
})();

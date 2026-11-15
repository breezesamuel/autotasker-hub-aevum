/** quick-lang-check.js */
var https = require('https');
function get(p) {
  return new Promise(function(r) {
    var req = https.get('https://autotasker.highkingflower.com' + p, {rejectUnauthorized:false, timeout:8000}, function(res) {
      var b = ''; res.on('data', function(c){b+=c;});
      res.on('end', function(){r({s:res.statusCode,b:b});});
    });
    req.on('error', function(e){r({s:0,e:e.message});});
    req.on('timeout', function(){req.destroy();r({s:0,e:'timeout'});});
    setTimeout(function(){req.destroy();r({s:0,e:'manual'});}, 9000);
  });
}
(async function() {
  var tests = [
    ['/en/offer.html', 'EN offer'],
    ['/ja/trending', 'JA trending'],
    ['/kr/faq', 'KR faq'],
    ['/partner', 'partner'],
    ['/api/partner/info', 'partner api'],
  ];
  for (var i=0; i<tests.length; i++) {
    var t = tests[i];
    var r = await get(t[0]);
    console.log((r.s===200?'[OK]':'[FAIL]')+' '+t[1]+': s='+r.s);
  }
})();

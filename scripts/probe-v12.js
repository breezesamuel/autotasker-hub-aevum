/** probe-v12.js — check if v12 endpoints are live in production */
var https = require('https');
function get(p, cb) {
  var req = https.get({ hostname: 'autotasker.highkingflower.com', path: p, rejectUnauthorized: false, timeout: 15000 }, function (res) {
    var b = ''; res.on('data', function (c) { b += c; });
    res.on('end', function () { cb({ s: res.statusCode, b: b }); });
  });
  req.on('error', function (e) { cb({ s: 0, b: e.message }); });
}
var n = 0;
function done() { if (++n === 5) process.exit(0); }
get('/api/status', function (r) {
  var j = {}; try { j = JSON.parse(r.b); } catch (e) {}
  console.log('1. status: s=' + r.s + ' settled=' + (j.settledCount !== undefined ? j.settledCount : '?') + ' revenue=$' + (j.totalRevenueUsd !== undefined ? j.totalRevenueUsd : '?'));
  done();
});
get('/api/games/ton', function (r) {
  var j = {}; try { j = JSON.parse(r.b); } catch (e) {}
  var v12 = !!(j.fairness && j.currentSeedHash);
  console.log('2. games/ton: s=' + r.s + ' games=' + (j.games ? j.games.length : '?') + ' v12engine=' + v12);
  done();
});
get('/api/discover/dormant', function (r) {
  var j = {}; try { j = JSON.parse(r.b); } catch (e) {}
  console.log('3. dormant: s=' + r.s + ' status=' + (j.status || '?') + ' totals=' + JSON.stringify(j.totals || null));
  done();
});
get('/api/chains/solana/status', function (r) {
  var j = {}; try { j = JSON.parse(r.b); } catch (e) {}
  console.log('4. solana status: s=' + r.s + ' mode=' + (j.mode || '?') + ' v12rpc=' + (j.rpc ? 'yes' : 'no'));
  done();
});
get('/api/sweep/status', function (r) {
  var j = {}; try { j = JSON.parse(r.b); } catch (e) {}
  console.log('5. sweep: s=' + r.s + ' treasury=$' + (j.treasuryBalanceUsd !== undefined ? j.treasuryBalanceUsd : '?') + ' dormant=$' + (j.dormantAssetsUsd !== undefined ? j.dormantAssetsUsd : '?'));
  done();
});

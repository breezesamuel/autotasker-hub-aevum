/** cleanup-test-data.js — remove v14 unit-test artifacts from local dev data */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 1. remove test bounties (poster = test wallet)
var bf = path.join(ROOT, 'data', 'bounties.json');
try {
  var bd = JSON.parse(fs.readFileSync(bf, 'utf8'));
  var before = bd.bounties.length;
  bd.bounties = bd.bounties.filter(b => b.posterWallet !== '0xposterwallet0000000000000000000000000001');
  fs.writeFileSync(bf, JSON.stringify(bd, null, 2));
  console.log('bounties: removed ' + (before - bd.bounties.length) + ' test bounties, kept ' + bd.bounties.length);
} catch (e) { console.log('bounties: skip (' + e.message.slice(0, 50) + ')'); }

// 2. remove test workers/matches (W1/W2/W3 test wallets + test bounty matches)
var mf = path.join(ROOT, 'data', 'bounty-matching.json');
try {
  var md = JSON.parse(fs.readFileSync(mf, 'utf8'));
  var wk = Object.keys(md.workers);
  md.workers = {};
  md.matches = {};
  md.bumpLog = [];
  md.stats = { workersRegistered: 0, matchesRun: 0, bumpsIssued: 0, repUpdates: 0 };
  fs.writeFileSync(mf, JSON.stringify(md, null, 2));
  console.log('bounty-matching: cleaned ' + wk.length + ' test workers');
} catch (e) { console.log('bounty-matching: skip'); }

// 3. remove attribution test touches (test wallets)
var af = path.join(ROOT, 'data', 'attribution.json');
try {
  var ad = JSON.parse(fs.readFileSync(af, 'utf8'));
  ad.touches = (ad.touches || []).filter(t => !/attrtest|v13verify|testwallet/i.test(t.wallet || ''));
  ad.settlements = (ad.settlements || []).filter(s => !/attrtest|notouch|v13verify/i.test(s.wallet || ''));
  fs.writeFileSync(af, JSON.stringify(ad, null, 2));
  console.log('attribution: cleaned test entries');
} catch (e) { console.log('attribution: skip'); }

// 4. remove pricing-bandit test tools
var pf = path.join(ROOT, 'data', 'pricing-bandit.json');
try {
  var pd = JSON.parse(fs.readFileSync(pf, 'utf8'));
  var tk = Object.keys(pd.tools || {});
  for (var t of tk) { if (/test_tool_v13b/i.test(t)) delete pd.tools[t]; }
  fs.writeFileSync(pf, JSON.stringify(pd, null, 2));
  console.log('pricing-bandit: cleaned ' + tk.filter(t => /test_tool_v13b/i.test(t)).length + ' test tools');
} catch (e) { console.log('pricing-bandit: skip'); }

// 5. remove games test player
var gf = path.join(ROOT, 'data', 'games.json');
try {
  var gd = JSON.parse(fs.readFileSync(gf, 'utf8'));
  var before2 = Object.keys(gd.players || {}).length;
  for (var w of Object.keys(gd.players || {})) { if (/v13verify|testwallet/i.test(w)) delete gd.players[w]; }
  gd.plays = (gd.plays || []).filter(p => !/v13verify|testwallet/i.test(p.walletFull || ''));
  fs.writeFileSync(gf, JSON.stringify(gd, null, 2));
  console.log('games: cleaned, players ' + before2 + '->' + Object.keys(gd.players || {}).length);
} catch (e) { console.log('games: skip'); }

// 6. remove social-queue test drafts
var qf = path.join(ROOT, 'data', 'social-queue', 'queue.json');
try { fs.unlinkSync(qf); console.log('social-queue: test queue removed'); } catch (e) { console.log('social-queue: skip'); }

// 7. v16: reset paper trading journal + edge policy (tests are destructive to them)
var tj = path.join(ROOT, 'data', 'trading-journal.json');
try { fs.unlinkSync(tj); console.log('trading-journal: reset'); } catch (e) { console.log('trading-journal: skip'); }
var ep = path.join(ROOT, 'data', 'edge-policy.json');
try { fs.unlinkSync(ep); console.log('edge-policy: reset'); } catch (e) { console.log('edge-policy: skip'); }

console.log('CLEANUP DONE');

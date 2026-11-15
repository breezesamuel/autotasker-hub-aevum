/** test-v13b.js — unit tests for attribution + pricing-bandit (offline) */
const attr = require('../lib/attribution');
const bandit = require('../lib/pricing-bandit');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('[OK] ' + name + (extra ? ' | ' + extra : '')); }
  else { fail++; console.log('[FAIL] ' + name + (extra ? ' | ' + extra : '')); }
}

// ── attribution ──────────────────────────────────────────────────────────────
var W = '0xAttrTest00000000000000000000000000001';

// touch 1: content page visit (first touch)
var r1 = attr.recordTouch({ type: 'view', channel: 'content:weibo-hot-nov15', id: 'weibo-hot-nov15', wallet: W });
check('attr touch-record', r1.ok === true, 'touches=' + r1.touchCount);

// touch 2: referral click (last touch)
var r2 = attr.recordTouch({ type: 'click', channel: 'referral', id: 'CODE-X1', wallet: W });
check('attr touch-referral', r2.ok === true);

// settlement attribution
var a1 = attr.attributeSettlement({ wallet: W, tool: 'get_hotlist', usd: 0.05 });
check('attr settlement', a1.ok === true && a1.attribution.credits.first.channel === 'content:weibo-hot-nov15' && a1.attribution.credits.last.channel === 'referral',
  'first=' + a1.attribution.credits.first.channel + ' last=' + a1.attribution.credits.last.channel + ' matched=' + a1.attribution.matched);

// settlement with NO touches → unattributed
var a2 = attr.attributeSettlement({ wallet: '0xNoTouch0000000000000000000000000000002', tool: 'search', usd: 0.01 });
check('attr unattributed', a2.ok === true && a2.attribution.matched === 'none');

// channel ROI
var roi = attr.getChannelROI();
var contentRow = roi.channels.find(c => c.channel === 'content:weibo-hot-nov15');
var refRow = roi.channels.find(c => c.channel === 'referral');
check('attr channelROI', !!contentRow && !!refRow, 'content $' + (contentRow ? contentRow.usdFirst : '?') + ' first / referral $' + (refRow ? refRow.usdLast : '?') + ' last');

// content ROI
var croi = attr.getContentROI();
check('attr contentROI', croi.contentPages.length >= 1 && croi.contentPages[0].slug === 'weibo-hot-nov15', 'top=' + (croi.contentPages[0] ? croi.contentPages[0].slug : '?'));

// report
var rep = attr.report();
check('attr report', rep.stats.totalSettlements >= 2 && typeof rep.stats.attributionRate === 'string', 'rate=' + rep.stats.attributionRate);

// ── pricing bandit ───────────────────────────────────────────────────────────
var T = 'test_tool_v13b_' + Date.now().toString(36); // fresh per run — bandit state persists

// before signal: paused → rule price
var p1 = bandit.pickArm(T);
check('bandit paused-initially', p1.paused === true && p1.arm === 1.0, 'note=' + p1.note);

// record impressions + 3 conversions on arm 1.3 (winner)
for (var i = 0; i < 20; i++) bandit.recordImpression(T, 1.3);
for (var j = 0; j < 10; j++) bandit.recordImpression(T, 1.0);
bandit.recordConversion(T, 1.3, 0.05);
bandit.recordConversion(T, 1.3, 0.05);
bandit.recordConversion(T, 1.3, 0.05);

var p2 = bandit.pickArm(T);
check('bandit unpaused-after-signal', p2.paused === false, 'eps=' + p2.epsilon);

// 30 more picks → majority should be 1.3 (best RPI: 0.15/20 vs 0/10)
var picks = {};
for (var k = 0; k < 30; k++) { var p = bandit.pickArm(T); picks[p.arm] = (picks[p.arm] || 0) + 1; }
check('bandit exploits-winner', (picks[1.3] || 0) >= (picks[0.7] || 0) && (picks[1.3] || 0) >= (picks[1.0] || 0), JSON.stringify(picks));

// report
var br = bandit.getReport();
var tr = br.tools.find(t => t.tool === T);
check('bandit report', !!tr && tr.winner === 1.3 && tr.arms.length === 3, 'winner=' + tr.winner + ' convs=' + tr.arms[2].conversions);

// ── v15: deterministic windowed arms ─────────────────────────────────────────
var T15 = 'test_tool_v13b_w15_' + Date.now().toString(36);

check('bandit pickArmWindow-exported', typeof bandit.pickArmWindow === 'function');

// seed: ≥3 conversions so the tool unpauses
bandit.recordConversion(T15, 1.3, 0.05);
bandit.recordConversion(T15, 1.3, 0.05);
bandit.recordConversion(T15, 1.3, 0.05);
for (var i15 = 0; i15 < 30; i15++) bandit.recordImpression(T15, 1.3);

var w1 = bandit.pickArmWindow(T15);
var w2 = bandit.pickArmWindow(T15);
check('bandit window-deterministic', w1.arm === w2.arm && w1.window === w2.window,
  'arm=' + w1.arm + ' window=' + w1.window + ' cached=' + w2.cached);
check('bandit window-cached-second-call', w2.cached === true);

// freeze survives mid-window state shifts: make 0.7 the live winner
bandit.recordConversion(T15, 0.7, 0.35); // 0.7 RPI spikes: $0.35 / 1 imp
for (var j15 = 0; j15 < 5; j15++) bandit.recordImpression(T15, 0.7);
var w3 = bandit.pickArmWindow(T15);
var liveWinner = bandit.pickArm(T15).arm;
check('bandit window-frozen-despite-winner-shift', w3.arm === w1.arm,
  'frozen=' + w3.arm + ' liveWinner=' + liveWinner);

// recordConversion(null) resolves via the current window's arm
bandit.recordConversion(T15, null, 0.07);
var br15 = bandit.getReport().tools.find(t => t.tool === T15);
var convArm = br15.arms.find(a => a.multiplier === w1.arm);
check('bandit conversion-resolves-via-window', !!convArm && convArm.conversions >= (w1.arm === 1.3 ? 4 : 1),
  'arm=' + w1.arm + ' convs=' + (convArm ? convArm.conversions : 'missing'));

// USDC 2-decimal floor: sub-$0.02 prices don't get a degenerate experiment
check('bandit shouldExperiment-floor', bandit.shouldExperiment(10000) === false &&
  bandit.shouldExperiment(20000) === true && bandit.shouldExperiment(50000) === true,
  '$0.01 locked, $0.02+ eligible');

console.log('\nTotal:' + (pass + fail) + ' PASS:' + pass + ' FAIL:' + fail);
process.exit(fail === 0 ? 0 : 1);

/** test-v16.js — unit tests for trading-journal + edge-gate + edge-calibration (offline) */
const journal = require('../lib/trading-journal');
const gate = require('../lib/edge-gate');
const calibration = require('../lib/edge-calibration');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('[OK] ' + name + (extra ? ' | ' + extra : '')); }
  else { fail++; console.log('[FAIL] ' + name + (extra ? ' | ' + extra : '')); }
}
const CAT = 't16_probe_' + Date.now().toString(36); // unique per run; cleanup resets journal

// ── journal lifecycle ────────────────────────────────────────────────────────
var o1 = journal.openThesis({ category: CAT, asset: 'BTC', side: 'long', confidence: 0.6, thesis: 'breakout probe with predefined stop and target', hasStop: true, plannedRiskPct: 1, actualRiskPct: 1, entryRef: 100, feesR: 0.02, stopPct: 3.5 });
check('journal open-ok', o1.ok === true && o1.thesis.status === 'open', o1.thesis ? o1.thesis.id : o1.reason);
check('journal stopPct-persisted', o1.thesis.stopPct === 3.5, 'stopPct=' + o1.thesis.stopPct); // settle must use the PLANNED stop distance, not a silent 2% fallback

check('journal reject-planless', journal.openThesis({ category: CAT, side: 'long', confidence: 0.5, thesis: 'short', hasStop: true, plannedRiskPct: 1, actualRiskPct: 1, entryRef: 1 }).ok === false);
check('journal reject-oversize', journal.openThesis({ category: CAT, asset: 'BTC', side: 'long', confidence: 0.5, thesis: 'actual risk exceeds the planned risk cap', hasStop: true, plannedRiskPct: 1, actualRiskPct: 3, entryRef: 100 }).ok === false);

var c1 = journal.closeThesis(o1.thesis.id, { outcome: 'win', resultR: 2 - 0.02, learnings: 'target hit' });
check('journal close-ok', c1.ok === true && c1.thesis.resultR === 1.98, 'R=' + c1.thesis.resultR);
check('journal close-idempotent', journal.closeThesis(o1.thesis.id, { outcome: 'win', resultR: 1 }).ok === false);

// seeded record: 2 wins @ +2R, 2 losses @ -1R, confidences for Brier math
journal.openThesis({ category: CAT, asset: 'ETH', side: 'long', confidence: 0.8, thesis: 'seed thesis two for statistics math', hasStop: true, plannedRiskPct: 1, actualRiskPct: 1, entryRef: 50 });
var ids = journal.listOpen().filter(t => t.category === CAT).map(t => t.id);
journal.closeThesis(ids[0], { outcome: 'win', resultR: 2 - 0.02 });
journal.openThesis({ category: CAT, asset: 'SOL', side: 'long', confidence: 0.4, thesis: 'seed thesis three for statistics math', hasStop: true, plannedRiskPct: 1, actualRiskPct: 1, entryRef: 20 });
ids = journal.listOpen().filter(t => t.category === CAT).map(t => t.id);
journal.closeThesis(ids[0], { outcome: 'loss', resultR: -1 - 0.02 });
journal.openThesis({ category: CAT, asset: 'BNB', side: 'long', confidence: 0.4, thesis: 'seed thesis four for statistics math', hasStop: true, plannedRiskPct: 1, actualRiskPct: 1, entryRef: 300 });
ids = journal.listOpen().filter(t => t.category === CAT).map(t => t.id);
journal.closeThesis(ids[0], { outcome: 'loss', resultR: -1 - 0.02 });

var st = journal.categoryStats(CAT);
check('journal stats-math', st.closed === 4 && st.winRate === 0.5 && st.payoff === 1.94 && st.expectancyR === 0.48,
  'wr=' + st.winRate + ' payoff=' + st.payoff + ' expR=' + st.expectancyR);
// Brier: conf[.6,.8,.4,.4] y[1,1,0,0] → (.16+.04+.16+.16)/4 = 0.13
check('journal brier-math', st.brier === 0.13, 'brier=' + st.brier);

// gateOut records the rejected attempt for gate calibration
journal.gateOut({ category: CAT, asset: 'XRP', side: 'long', confidence: 0.4, thesis: 'attempt that the gate rejected for probe', hasStop: true, plannedRiskPct: 1, actualRiskPct: 1, entryRef: 1 }, 'BLOCKED', ['test']);
check('journal gateOut-recorded', journal.report().stats.gatedOut >= 1);

// ── edge-gate ────────────────────────────────────────────────────────────────
const GOOD_THESIS = { category: CAT, asset: 'BTC', side: 'long', confidence: 0.6, thesis: 'fully planned probe entry with stop', hasStop: true, plannedRiskPct: 1, actualRiskPct: 1 };

var g1 = gate.evaluate({ thesis: GOOD_THESIS, account: { maxDrawdownPct: 0, dayPnlPct: 0, weekPnlPct: 0, monthPnlPct: 0, losingStreak: 0 }, regime: {}, edge: { expectancyR: 0.23, sampleSize: 4, winRate: 0.5, payoff: 2 } });
check('gate unproven-edge-manual', g1.decision === 'MANUAL_REVIEW', g1.decision);

var g2 = gate.evaluate({ thesis: GOOD_THESIS, account: { maxDrawdownPct: 0, dayPnlPct: 0, weekPnlPct: 0, monthPnlPct: 0, losingStreak: 0 }, regime: {}, edge: { expectancyR: 0.23, sampleSize: 12, winRate: 0.5, payoff: 2 } });
check('gate kelly-sizing', g2.decision === 'ALLOWED' && g2.sizing.riskPct === 2.5 && g2.sizing.method === 'kelly-0.25x',
  g2.decision + ' risk=' + g2.sizing.riskPct + '%');

var g3 = gate.evaluate({ thesis: GOOD_THESIS, account: { maxDrawdownPct: 0, dayPnlPct: -2.1, weekPnlPct: 0, monthPnlPct: 0, losingStreak: 0 }, regime: {}, edge: { expectancyR: 0.5, sampleSize: 30, winRate: 0.6, payoff: 2 } });
check('gate daily-halt', g3.decision === 'HALTED', g3.decision + ' | ' + g3.reasons[0]);

var g4 = gate.evaluate({ thesis: GOOD_THESIS, account: { maxDrawdownPct: 0, dayPnlPct: 0, weekPnlPct: 0, monthPnlPct: 0, losingStreak: 2, lastLossAt: new Date(Date.now() - 3600000).toISOString() }, regime: {}, edge: { expectancyR: 0.5, sampleSize: 30, winRate: 0.6, payoff: 2 } });
check('gate streak-cooldown', g4.decision === 'COOLDOWN', g4.decision + ' | ' + (g4.reasons[0] || ''));

var g5 = gate.evaluate({ thesis: GOOD_THESIS, account: { maxDrawdownPct: 0, dayPnlPct: 0, weekPnlPct: -5.5, monthPnlPct: 0, losingStreak: 0 }, regime: {}, edge: { expectancyR: 0.5, sampleSize: 30, winRate: 0.6, payoff: 2 } });
check('gate weekly-halt', g5.decision === 'HALTED');

var g6 = gate.evaluate({ thesis: GOOD_THESIS, account: { maxDrawdownPct: 25, dayPnlPct: 0, weekPnlPct: 0, monthPnlPct: 0, losingStreak: 0 }, regime: {}, edge: { expectancyR: 0.5, sampleSize: 30, winRate: 0.6, payoff: 2 } });
check('gate maxdd-halt', g6.decision === 'HALTED');

var g7 = gate.evaluate({ thesis: GOOD_THESIS, account: { maxDrawdownPct: 0, dayPnlPct: 0, weekPnlPct: 0, monthPnlPct: 0, losingStreak: 0 }, regime: { blocked: true }, edge: { expectancyR: 0.5, sampleSize: 30, winRate: 0.6, payoff: 2 } });
check('gate regime-blocked', g7.decision === 'BLOCKED');

var g8 = gate.evaluate({ thesis: Object.assign({}, GOOD_THESIS, { hasStop: false }), account: { maxDrawdownPct: 0, dayPnlPct: 0, weekPnlPct: 0, monthPnlPct: 0, losingStreak: 0 }, regime: {}, edge: { expectancyR: 0.5, sampleSize: 30, winRate: 0.6, payoff: 2 } });
check('gate discipline-no-stop', g8.decision === 'BLOCKED', g8.checks.filter(c => !c.pass).map(c => c.name).join(','));

// negative edge (kelly f*≤0) → BLOCKED even with big sample
var g9 = gate.evaluate({ thesis: GOOD_THESIS, account: { maxDrawdownPct: 0, dayPnlPct: 0, weekPnlPct: 0, monthPnlPct: 0, losingStreak: 0 }, regime: {}, edge: { expectancyR: -0.1, sampleSize: 40, winRate: 0.4, payoff: 1 } });
check('gate negative-edge-blocked', g9.decision === 'BLOCKED', g9.sizing.method);

// kill switch never bypasses to ALLOW (fail-closed)
process.env.EDGE_GATE_OFF = '1';
var g10 = gate.evaluate({ thesis: GOOD_THESIS, account: { maxDrawdownPct: 0, dayPnlPct: 0, weekPnlPct: 0, monthPnlPct: 0, losingStreak: 0 }, regime: {}, edge: { expectancyR: 0.5, sampleSize: 30, winRate: 0.6, payoff: 2 } });
check('gate kill-switch-manual', g10.decision === 'MANUAL_REVIEW');
delete process.env.EDGE_GATE_OFF;

// ── edge-calibration ─────────────────────────────────────────────────────────
var pol = calibration.policy();
var blockedCat = pol.blocked.find(b => b.category === CAT);
check('calibration blocked-neg-category', !!blockedCat === false, 'CAT expR=0.23>0 not blocked (correct)');

// force a negative category: 5 losses
const CATNEG = 't16_neg_' + Date.now().toString(36);
for (var i = 0; i < 5; i++) {
  var o = journal.openThesis({ category: CATNEG, asset: 'DOGE', side: 'long', confidence: 0.7, thesis: 'negative expectancy seed probe number ' + i, hasStop: true, plannedRiskPct: 1, actualRiskPct: 1, entryRef: 1 });
  journal.closeThesis(o.thesis.id, { outcome: 'loss', resultR: -1 - 0.02 });
}
var pol2 = calibration.policy();
check('calibration auto-block', !!pol2.blocked.find(b => b.category === CATNEG), 'blocked=' + pol2.blocked.map(b => b.category).join(','));

// haircut math: band with realized ≥10pp below predicted
const CATHC = 't16_hc_' + Date.now().toString(36);
for (var j = 0; j < 6; j++) {
  var o2 = journal.openThesis({ category: CATHC, asset: 'ADA', side: 'long', confidence: 0.85, thesis: 'overconfident seed probe for haircut math ' + j, hasStop: true, plannedRiskPct: 1, actualRiskPct: 1, entryRef: 1 });
  journal.closeThesis(o2.thesis.id, { outcome: 'loss', resultR: -1 - 0.02 }); // realized 0% vs predicted 85%
}
var pol3 = calibration.policy();
var hc = pol3.haircuts.find(h => h.category === CATHC);
check('calibration overconfidence-haircut', !!hc && hc.haircutTo === 0, hc ? JSON.stringify(hc) : 'none');
var hcConf = calibration.haircutConfidence(CATHC, 0.85);
check('calibration haircut-applies', hcConf === 0.05 || hcConf <= 0.2, '0.85 → ' + hcConf);

console.log('\nTotal:' + (pass + fail) + ' PASS:' + pass + ' FAIL:' + fail);
process.exit(fail === 0 ? 0 : 1);

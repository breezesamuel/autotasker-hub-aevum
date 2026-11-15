/**
 * edge-gate.js — v16: pre-trade decision gate (offline, fail-closed, paper-only).
 *
 * Mechanisms ported from skills-trading/ (MIT):
 *   - tradermonty drawdown-circuit-breaker: daily −2% HALT, 2-loss streak → 24h
 *     COOLDOWN, weekly −5% / monthly −8% HALT, max DD −20% full stop.
 *   - tradermonty pre-trade-discipline-gate: planless / oversized / revenge /
 *     regime-blocked orders are BLOCKED before entry.
 *   - agiprolabs kelly-criterion: fractional (0.25x) Kelly sizing, clamped to
 *     ≤2.5% of NAV; unknown edge (<5 closed trades) → fixed 1% research probe.
 *
 * Contract: evaluate() is PURE — no network, no fs. The caller supplies the
 * account state (from trading-journal.accountState()) and the live regime.
 * EDGE_GATE_OFF=1 does NOT bypass to ALLOW (fail-closed): it forces
 * MANUAL_REVIEW so nothing auto-trades.
 */
'use strict';

const RULES = {
  MAX_DAILY_LOSS_PCT: 2,
  LOSING_STREAK_COOLDOWN_H: 24,
  LOSING_STREAK_N: 2,
  MAX_WEEKLY_LOSS_PCT: 5,
  MAX_MONTHLY_LOSS_PCT: 8,
  MAX_DRAWDOWN_PCT: 20,
  MAX_RISK_PCT: 2.5,          // hard ceiling per trade
  KELLY_FRACTION: 0.25,
  MIN_EDGE_SAMPLE: 5,         // closed trades needed to trust expectancy
  FIXED_PROBE_RISK_PCT: 1,
};

function num(x, dflt) { const n = Number(x); return Number.isFinite(n) ? n : dflt; }

function hoursSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3600000;
}

/**
 * evaluate(input) → { decision, reasons[], checks[], sizing{riskPct, method}, rules }
 * decisions: ALLOWED | MANUAL_REVIEW | COOLDOWN | BLOCKED | HALTED
 */
function evaluate(input) {
  const t = (input && input.thesis) || {};
  const acc = (input && input.account) || {};
  const regime = (input && input.regime) || {};
  const edge = (input && input.edge) || {};
  const reasons = [];
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail).slice(0, 80) });

  // ── discipline gate (pre-trade checklist, all must pass) ──────────────────
  add('thesis-text', typeof t.thesis === 'string' && t.thesis.length >= 10, 'planless entry blocked');
  add('stop-predefined', t.hasStop === true, 'stop must be set before entry');
  const planned = num(t.plannedRiskPct, 0), actual = num(t.actualRiskPct, 0);
  add('risk-within-plan', planned > 0 && actual > 0 && actual <= planned, 'plan=' + planned + '% actual=' + actual + '%');
  add('risk-ceiling', actual > 0 && actual <= RULES.MAX_RISK_PCT, 'max ' + RULES.MAX_RISK_PCT + '% NAV');
  const conf = num(t.confidence, -1);
  add('confidence-declared', conf > 0 && conf <= 1, String(conf));
  add('edge-positive-or-unknown', edge.expectancyR == null || edge.sampleSize < RULES.MIN_EDGE_SAMPLE || edge.expectancyR > 0,
    'exp=' + (edge.expectancyR == null ? 'unknown' : edge.expectancyR) + ' n=' + (edge.sampleSize == null ? 0 : edge.sampleSize));
  const disciplinePass = checks.every(c => c.pass);

  // ── circuit breaker (account-level, evaluated regardless of discipline) ───
  const cb = [];
  if (num(acc.maxDrawdownPct, 0) >= RULES.MAX_DRAWDOWN_PCT) cb.push('max-drawdown ≥ ' + RULES.MAX_DRAWDOWN_PCT + '% → HALTED');
  if (num(acc.dayPnlPct, 0) <= -RULES.MAX_DAILY_LOSS_PCT) cb.push('daily loss ≥ ' + RULES.MAX_DAILY_LOSS_PCT + '% → HALTED (next day)');
  if (num(acc.weekPnlPct, 0) <= -RULES.MAX_WEEKLY_LOSS_PCT) cb.push('weekly loss ≥ ' + RULES.MAX_WEEKLY_LOSS_PCT + '% → HALTED (next Monday)');
  if (num(acc.monthPnlPct, 0) <= -RULES.MAX_MONTHLY_LOSS_PCT) cb.push('monthly loss ≥ ' + RULES.MAX_MONTHLY_LOSS_PCT + '% → HALTED');
  const sinceLoss = hoursSince(acc.lastLossAt);
  const streak = num(acc.losingStreak, 0);
  if (streak >= RULES.LOSING_STREAK_N && sinceLoss < RULES.LOSING_STREAK_COOLDOWN_H) {
    cb.push(streak + '-loss streak → COOLDOWN ' + Math.max(0, RULES.LOSING_STREAK_COOLDOWN_H - sinceLoss).toFixed(1) + 'h left');
  }
  if (regime.blocked) cb.push('market regime blocked by operator');
  add('circuit-breaker', cb.length === 0, cb.join('; ') || 'clear');

  // ── decision (fail-closed ordering: HALTED > BLOCKED > COOLDOWN > REVIEW) ──
  let decision = 'ALLOWED';
  const failedChecks = checks.filter(c => !c.pass).map(c => c.name);
  if (cb.some(r => r.includes('HALTED'))) decision = 'HALTED';
  else if (regime.blocked || !disciplinePass && cb.some(r => r.includes('COOLDOWN'))) decision = 'BLOCKED';
  else if (cb.some(r => r.includes('COOLDOWN'))) decision = 'COOLDOWN';
  else if (!disciplinePass) decision = 'BLOCKED';
  if (decision !== 'ALLOWED' && decision !== 'MANUAL_REVIEW') {
    reasons.push(...cb);
    for (const n of failedChecks) reasons.push('discipline: ' + n);
  }

  // unknown edge (< MIN_EDGE_SAMPLE closed trades in category) stays manual
  if (decision === 'ALLOWED' && (edge.sampleSize == null || edge.sampleSize < RULES.MIN_EDGE_SAMPLE)) {
    decision = 'MANUAL_REVIEW';
    reasons.push('edge unproven (<' + RULES.MIN_EDGE_SAMPLE + ' closed trades) — research probe only');
  }
  if (process.env.EDGE_GATE_OFF === '1' && decision === 'ALLOWED') {
    decision = 'MANUAL_REVIEW';
    reasons.push('EDGE_GATE_OFF=1 kill switch — auto-allow disabled');
  }

  // ── sizing: fractional Kelly from the category's realized record ──────────
  let riskPct = RULES.FIXED_PROBE_RISK_PCT, method = 'fixed-probe';
  const p = num(edge.winRate, null), b = num(edge.payoff, null);
  if (p != null && b != null && edge.sampleSize >= RULES.MIN_EDGE_SAMPLE) {
    const kelly = (p * b - (1 - p)) / b;
    if (kelly > 0) {
      riskPct = Math.min(RULES.KELLY_FRACTION * kelly, RULES.MAX_RISK_PCT / 100);
      riskPct = +(riskPct * 100).toFixed(3);
      method = 'kelly-0.25x';
    } else {
      riskPct = 0; method = 'kelly-negative-edge';
      if (decision === 'ALLOWED') { decision = 'BLOCKED'; reasons.push('kelly f*≤0 — negative edge, optimal bet is zero'); }
    }
  }

  return {
    decision, reasons, checks, sizing: { riskPct, method },
    rules: RULES, mode: 'paper',
  };
}

module.exports = { evaluate, RULES };

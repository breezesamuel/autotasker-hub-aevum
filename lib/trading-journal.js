/**
 * trading-journal.js — v16: paper-first thesis ledger for trading decisions.
 *
 * Every decision (including gated-out ones) is journaled so the GATE itself can
 * be calibrated later, not just the strategies. Trade thesis model adapted from
 * tradermonty/trader-memory-core + vizier (see skills-trading/).
 *
 * Hard rules:
 *   - PAPER ONLY. No execution path exists here; no exchange keys are read.
 *   - Idempotent transitions: open → closed/cancelled/gated_out (terminal).
 *   - Fail-closed bookkeeping: malformed closes are rejected, never guessed.
 *
 * Data: data/trading-journal.json (REMOTE_ONLY protected on deploy)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'data', 'trading-journal.json');

const PAPER_NAV_USD = 10000;      // fixed paper baseline; equity is simulated
const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (e) {
    return { version: 1, theses: [], stats: { opened: 0, closed: 0, wins: 0, losses: 0, gatedOut: 0 }, peakEquity: PAPER_NAV_USD };
  }
}
function saveState(s) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e) {}
}

function num(x, dflt) { const n = Number(x); return Number.isFinite(n) ? n : dflt; }

/**
 * openThesis — record a decision attempt. status='open' (paper position).
 * Required: category, side, confidence(0..1), thesis(text), hasStop,
 *           plannedRiskPct>0, actualRiskPct>0 (≤ planned), entryRef (price).
 */
function openThesis(input) {
  const s = loadState();
  const t = input || {};
  const conf = num(t.confidence, -1);
  if (!t.category || !t.side || conf < 0 || conf > 1) return { ok: false, reason: 'category/side/confidence(0..1) required' };
  if (!t.thesis || String(t.thesis).length < 10) return { ok: false, reason: 'thesis text required (≥10 chars) — no planless entries' };
  if (!t.hasStop) return { ok: false, reason: 'stop must be predefined before entry' };
  const planned = num(t.plannedRiskPct, 0), actual = num(t.actualRiskPct, 0);
  if (!(planned > 0) || !(actual > 0)) return { ok: false, reason: 'plannedRiskPct/actualRiskPct must be > 0' };
  if (actual > planned) return { ok: false, reason: 'actualRiskPct exceeds plan — discipline violation' };
  const entryRef = num(t.entryRef, 0);
  if (!(entryRef > 0)) return { ok: false, reason: 'entryRef price required' };

  const th = {
    id: 'th_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    ts: new Date().toISOString(),
    category: String(t.category).slice(0, 60),
    asset: String(t.asset || '').slice(0, 30),
    side: t.side === 'short' ? 'short' : 'long',
    confidence: +conf.toFixed(3),
    thesis: String(t.thesis).slice(0, 500),
    hasStop: true,
    plannedRiskPct: planned, actualRiskPct: actual,
    entryRef,
    stopPct: num(t.stopPct, 2),
    targetR: num(t.targetR, 2), stopR: -1, // default plan: +2R target, -1R stop
    feesR: num(t.feesR, 0.02),
    status: 'open', outcome: null, resultR: null, closedAt: null, learnings: null,
  };
  s.theses.unshift(th);
  s.stats.opened++;
  saveState(s);
  return { ok: true, thesis: th };
}

/** closeThesis — terminal. outcome win|loss; resultR net-of-fees R multiple. */
function closeThesis(id, input) {
  const s = loadState();
  const th = s.theses.find(x => x.id === id);
  if (!th) return { ok: false, reason: 'thesis not found' };
  if (th.status !== 'open') return { ok: false, reason: 'already ' + th.status + ' (idempotent guard)' };
  const outcome = input && input.outcome;
  if (outcome !== 'win' && outcome !== 'loss') return { ok: false, reason: 'outcome must be win|loss' };
  let r = num(input && input.resultR, NaN);
  if (!Number.isFinite(r)) return { ok: false, reason: 'resultR required (net R multiple)' };
  if (outcome === 'win' && r <= 0) return { ok: false, reason: 'win must have resultR > 0' };
  if (outcome === 'loss' && r >= 0) return { ok: false, reason: 'loss must have resultR < 0' };

  th.status = 'closed';
  th.outcome = outcome;
  th.resultR = +r.toFixed(4);
  th.closedAt = new Date().toISOString();
  th.learnings = String((input && input.learnings) || '').slice(0, 300) || null;
  s.stats.closed++;
  if (outcome === 'win') s.stats.wins++; else s.stats.losses++;
  // equity tracking for circuit-breaker math
  const eq = accountEquity(s);
  if (eq > (s.peakEquity || PAPER_NAV_USD)) s.peakEquity = eq;
  saveState(s);
  return { ok: true, thesis: th };
}

/** cancelThesis — closed without outcome (e.g. setup invalidated pre-fill). */
function cancelThesis(id, reason) {
  const s = loadState();
  const th = s.theses.find(x => x.id === id);
  if (!th) return { ok: false, reason: 'thesis not found' };
  if (th.status !== 'open') return { ok: false, reason: 'already ' + th.status };
  th.status = 'cancelled';
  th.closedAt = new Date().toISOString();
  th.learnings = String(reason || '').slice(0, 300) || null;
  saveState(s);
  return { ok: true, thesis: th };
}

/** gateOut — record an attempt the edge-gate REJECTED (kept for gate calibration). */
function gateOut(input, decision, reasons) {
  const s = loadState();
  const t = input || {};
  s.theses.unshift({
    id: 'th_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    ts: new Date().toISOString(),
    category: String(t.category || '').slice(0, 60),
    asset: String(t.asset || '').slice(0, 30),
    side: t.side === 'short' ? 'short' : 'long',
    confidence: num(t.confidence, 0),
    thesis: String(t.thesis || '').slice(0, 500),
    hasStop: !!t.hasStop,
    plannedRiskPct: num(t.plannedRiskPct, 0), actualRiskPct: num(t.actualRiskPct, 0),
    entryRef: num(t.entryRef, 0),
    status: 'gated_out', gateDecision: decision, gateReasons: (reasons || []).slice(0, 8),
    outcome: null, resultR: null, closedAt: null, learnings: null,
  });
  s.stats.gatedOut++;
  saveState(s);
  return { ok: true };
}

function listOpen() {
  return loadState().theses.filter(t => t.status === 'open');
}

/** per-category stats: winRate, avg R, expectancy NET of fees, Brier score. */
function categoryStats(category) {
  const s = loadState();
  const closed = s.theses.filter(t => t.status === 'closed' && t.category === category);
  const n = closed.length;
  const wins = closed.filter(t => t.outcome === 'win');
  const losses = closed.filter(t => t.outcome === 'loss');
  const winRate = n ? wins.length / n : null;
  const avgWinR = wins.length ? wins.reduce((a, t) => a + t.resultR, 0) / wins.length : null;
  const avgLossR = losses.length ? losses.reduce((a, t) => a + t.resultR, 0) / losses.length : null;
  // expectancy net of per-trade fees (feesR already in resultR by convention, kept for audit)
  const expectancyR = n ? closed.reduce((a, t) => a + t.resultR, 0) / n : null;
  // Brier: mean((confidence − y)²), y=1 win, 0 loss
  let brier = null, logLoss = null;
  if (n) {
    let bs = 0, ll = 0;
    for (const t of closed) {
      const y = t.outcome === 'win' ? 1 : 0;
      const p = Math.min(0.999, Math.max(0.001, t.confidence));
      bs += Math.pow(t.confidence - y, 2);
      ll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    }
    brier = +(bs / n).toFixed(4);
    logLoss = +(ll / n).toFixed(4);
  }
  const payoff = (avgWinR != null && avgLossR != null && avgLossR < 0) ? (avgWinR / Math.abs(avgLossR)) : null;
  return {
    category, closed: n, wins: wins.length, losses: losses.length,
    winRate: winRate == null ? null : +winRate.toFixed(3),
    avgWinR: avgWinR == null ? null : +avgWinR.toFixed(3),
    avgLossR: avgLossR == null ? null : +avgLossR.toFixed(3),
    payoff: payoff == null ? null : +payoff.toFixed(2),
    expectancyR: expectancyR == null ? null : +expectancyR.toFixed(3),
    brier, logLoss,
  };
}

/** account state for the circuit breaker (paper equity from realized R). */
function accountEquity(s) {
  s = s || loadState();
  let eq = PAPER_NAV_USD;
  for (const t of s.theses) {
    if (t.status === 'closed' && Number.isFinite(t.resultR)) {
      eq += t.resultR * (t.actualRiskPct / 100) * PAPER_NAV_USD;
    }
  }
  return +eq.toFixed(2);
}

function accountState() {
  const s = loadState();
  const now = Date.now();
  const pnlIn = (ms) => s.theses
    .filter(t => t.status === 'closed' && Number.isFinite(t.resultR) && t.closedAt && (now - new Date(t.closedAt).getTime()) < ms)
    .reduce((a, t) => a + t.resultR * (t.actualRiskPct / 100), 0); // fraction of NAV
  const losing = s.theses
    .filter(t => t.status === 'closed' && t.outcome === 'loss' && t.closedAt)
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
  // consecutive terminal losses (most recent first)
  let streak = 0;
  for (const t of s.theses.filter(t => t.status === 'closed' && t.closedAt).sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))) {
    if (t.outcome === 'loss') streak++; else break;
  }
  const eq = accountEquity(s);
  const peak = Math.max(s.peakEquity || PAPER_NAV_USD, eq);
  return {
    paperNavUsd: PAPER_NAV_USD,
    equityUsd: eq,
    peakEquityUsd: peak,
    maxDrawdownPct: +(((peak - eq) / peak) * 100).toFixed(2),
    dayPnlPct: +(pnlIn(DAY_MS) * 100).toFixed(2),
    weekPnlPct: +(pnlIn(WEEK_MS) * 100).toFixed(2),
    monthPnlPct: +(pnlIn(MONTH_MS) * 100).toFixed(2),
    losingStreak: streak,
    lastLossAt: losing[0] ? losing[0].closedAt : null,
  };
}

function report() {
  const s = loadState();
  const categories = {};
  for (const t of s.theses) {
    if (t.category && !categories[t.category]) categories[t.category] = categoryStats(t.category);
  }
  return {
    mode: 'paper',
    stats: s.stats,
    account: accountState(),
    categories: Object.values(categories),
    openTheses: s.theses.filter(t => t.status === 'open').slice(0, 10),
    recent: s.theses.slice(0, 10),
  };
}

module.exports = { openThesis, closeThesis, cancelThesis, gateOut, listOpen, categoryStats, accountState, accountEquity, report, PAPER_NAV_USD };

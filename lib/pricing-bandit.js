/**
 * pricing-bandit.js — v13: epsilon-greedy price experimentation.
 *
 * smart-pricing.js sets prices by RULES (time-of-day, volume tiers).
 * This module adds LEARNING: per-tool price arms compete; the bandit shifts
 * traffic toward the arm with the best revenue-per-impression.
 *
 * Arms per tool: multipliers [0.7, 1.0, 1.3] around the rule price.
 *   impression = a 402 payment challenge issued at that arm's price
 *   conversion = a settled payment at that arm's price
 * Objective: revenue per impression (not conversion count — cheaper price
 * converts more but earns less; the bandit optimizes actual USD).
 *
 * Exploration: epsilon decays 0.20 → 0.05 as samples accumulate.
 * Guardrails: no arm below 0.5x; experiment paused if tool has < 3 convs total
 * (not enough signal → stick to rule price 1.0x).
 *
 * API:
 *   pickArm(tool)                    → { arm, multiplier, epsilon }
 *   pickArmWindow(tool)              → { arm, multiplier, epsilon, window }  (v15: frozen per 15-min window)
 *   recordImpression(tool, arm)      → called when 402 challenge issued
 *   recordConversion(tool, arm, usd) → called from onAfterSettle
 *   getReport()                      → arms table + decisions for /ops
 */
'use strict';

const fs = require('fs');
const path = require('path');
const atomicWrite = require('./atomic-write');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'data', 'pricing-bandit.json');

const ARMS = [0.7, 1.0, 1.3];
const MIN_CONVS_FOR_EXPLOIT = 3;
const EPS_START = 0.20, EPS_FLOOR = 0.05;
const IMPRESSIONS_PER_EPS_STEP = 50;
const MIN_ATOMIC_FOR_EXPERIMENT = 20000; // $0.02 — USDC 2-decimal floor; below, 0.7x rounds back to the base price

// Single source of truth for "is it worth experimenting on this price?" —
// x402-v4's banditPrice() consults this so the 2-decimal constraint lives in
// one testable place instead of a scattered magic number.
function shouldExperiment(priceAtomic) {
  return Number(priceAtomic) >= MIN_ATOMIC_FOR_EXPERIMENT;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (e) {
    return { version: 1, tools: {}, stats: { totalImpressions: 0, totalConversions: 0, totalRevenueUsd: 0 } };
  }
}
function saveState(s) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    atomicWrite.writeJsonAtomic(STATE_FILE, s);
  } catch (e) {}
}

function toolState(s, tool) {
  if (!s.tools[tool]) {
    s.tools[tool] = {
      arms: {},
      lastArm: 1.0,
      paused: false,
    };
    for (const a of ARMS) s.tools[tool].arms[a] = { impressions: 0, conversions: 0, revenueUsd: 0 };
  }
  return s.tools[tool];
}

function epsilonFor(t) {
  const totalImps = Object.values(t.arms).reduce((x, a) => x + a.impressions, 0);
  const eps = Math.max(EPS_FLOOR, EPS_START - Math.floor(totalImps / IMPRESSIONS_PER_EPS_STEP) * 0.05);
  return eps;
}

function revenuePerImpression(arm) {
  return arm.impressions > 0 ? arm.revenueUsd / arm.impressions : 0;
}

// conservative: only exploit once we have ≥ MIN_CONVS_FOR_EXPLOIT total conversions
function pickArm(tool) {
  const s = loadState();
  const t = toolState(s, tool);
  const totalConvs = Object.values(t.arms).reduce((x, a) => x + a.conversions, 0);

  if (t.paused || totalConvs < MIN_CONVS_FOR_EXPLOIT) {
    saveState(s); // ensure tool row exists
    return { arm: 1.0, multiplier: 1.0, epsilon: 0, paused: t.paused || totalConvs < MIN_CONVS_FOR_EXPLOIT, note: 'rule price (insufficient signal or paused)' };
  }

  const eps = epsilonFor(t);
  let arm;
  if (Math.random() < eps) {
    arm = ARMS[Math.floor(Math.random() * ARMS.length)];
  } else {
    arm = ARMS.slice().sort((a, b) => revenuePerImpression(t.arms[b]) - revenuePerImpression(t.arms[a]))[0];
  }
  t.lastArm = arm;
  saveState(s);
  return { arm, multiplier: arm, epsilon: eps, paused: false };
}

const crypto = require('crypto');
const WINDOW_MS = 15 * 60 * 1000; // price stable within a 15-min window

/**
 * v15: DETERMINISTIC windowed arm — same arm for all requests in a 15-min bucket.
 *
 * Why: per-request random arms break x402 — the 402 challenge quotes a price,
 * the client pays THAT amount, and verify re-computes requirements; if the arm
 * re-rolled between challenge and payment the amounts mismatch and the
 * settlement fails. Windowed determinism makes 402 and verify agree while
 * still exploring across windows.
 */
function pickArmWindow(tool) {
  const s = loadState();
  const t = toolState(s, tool);
  const window = Math.floor(Date.now() / WINDOW_MS);

  // Arm is FROZEN once per (tool, window): the 402 challenge and the verify
  // recompute must see the SAME price even if impressions/conversions shift
  // mid-window (epsilon or winner changes would otherwise flip the arm and
  // void in-flight settlements). Cached arm also survives process restarts.
  if (t.windowArm && t.windowArm.window === window) {
    return { arm: t.windowArm.arm, multiplier: t.windowArm.multiplier, epsilon: t.windowArm.epsilon, window, paused: !!t.windowArm.paused, cached: true };
  }

  const totalConvs = Object.values(t.arms).reduce((x, a) => x + a.conversions, 0);
  let decision;
  if (t.paused || totalConvs < MIN_CONVS_FOR_EXPLOIT) {
    decision = { arm: 1.0, multiplier: 1.0, epsilon: 0, window, paused: true, note: 'rule price (insufficient signal or paused)' };
  } else {
    const eps = epsilonFor(t);
    const h1 = parseInt(crypto.createHash('md5').update(tool + ':' + window).digest('hex').slice(0, 8), 16);
    const r = (h1 % 10000) / 10000;
    let arm;
    if (r < eps) {
      arm = ARMS[h1 % ARMS.length];
    } else {
      arm = ARMS.slice().sort((a, b) => revenuePerImpression(t.arms[b]) - revenuePerImpression(t.arms[a]))[0];
    }
    decision = { arm, multiplier: arm, epsilon: eps, window, paused: false };
  }
  t.windowArm = { window, arm: decision.arm, multiplier: decision.multiplier, epsilon: decision.epsilon, paused: !!decision.paused };
  t.lastArm = decision.arm;
  saveState(s);
  return decision;
}

// resolve conversion arm: explicit arg wins; else the CURRENT window's arm
// (deterministic → same arm the challenge quoted, as long as settlement
// lands in the same or next window; cross-window drift is acceptable noise)
function recordConversion(tool, arm, usd) {
  const s = loadState();
  const t = toolState(s, tool);
  let resolved = Number(arm) || 0;
  if (!resolved || !t.arms[resolved]) {
    try { resolved = pickArmWindow(tool).arm; } catch (e) { resolved = 1.0; }
  }
  const a = t.arms[resolved];
  if (a) { a.conversions++; a.revenueUsd += Number(usd) || 0; s.stats.totalConversions++; s.stats.totalRevenueUsd += Number(usd) || 0; }
  saveState(s);
}

function recordImpression(tool, arm) {
  const s = loadState();
  const t = toolState(s, tool);
  const a = t.arms[Number(arm) || 1.0];
  if (a) { a.impressions++; s.stats.totalImpressions++; }
  saveState(s);
}

function getReport() {
  const s = loadState();
  const tools = Object.entries(s.tools).map(([tool, t]) => ({
    tool,
    paused: t.paused || Object.values(t.arms).reduce((x, a) => x + a.conversions, 0) < MIN_CONVS_FOR_EXPLOIT,
    lastArm: t.lastArm,
    arms: ARMS.map(a => ({
      multiplier: a,
      impressions: t.arms[a].impressions,
      conversions: t.arms[a].conversions,
      revenueUsd: +t.arms[a].revenueUsd.toFixed(4),
      revPerImpression: +revenuePerImpression(t.arms[a]).toFixed(6),
    })),
    winner: ARMS.slice().sort((x, y) => revenuePerImpression(t.arms[y]) - revenuePerImpression(t.arms[x]))[0],
    epsilon: epsilonFor(t),
  }));
  return {
    objective: 'revenue per impression',
    arms: ARMS,
    guardrail: 'no exploit until ' + MIN_CONVS_FOR_EXPLOIT + ' total conversions per tool',
    stats: s.stats,
    tools,
  };
}

module.exports = { pickArm, pickArmWindow, recordImpression, recordConversion, getReport, ARMS, shouldExperiment, MIN_ATOMIC_FOR_EXPERIMENT };

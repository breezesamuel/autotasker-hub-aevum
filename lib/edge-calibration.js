/**
 * edge-calibration.js — v16: turn the journal's settled record into a pre-trade
 * EDGE POLICY (pattern after ryanfrigo/kalshi-ai-trading-bot, MIT, skills-trading/).
 *
 *   Block    — a category with ≥5 settled trades and expectancy ≤ 0 (net of fees)
 *              is BLOCKED: the gate refuses future probes in it.
 *   Haircut  — a confidence band where realized win-rate runs ≥10pp BELOW the
 *              predicted mean shrinks future confidence to the realized mean,
 *              so sizing math stops trusting the overconfident estimate.
 *   Calibrate— Brier / log-loss + bucket table make "40% correct" measurable
 *              instead of aspirational.
 *
 * Forward-only honesty: only CLOSED theses count; gated-out/cancelled never
 * enter the denominators.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const journal = require('./trading-journal');

const ROOT = path.resolve(__dirname, '..');
const POLICY_FILE = path.join(ROOT, 'data', 'edge-policy.json');

const MIN_BLOCK_SAMPLE = 5;        // closed trades before a category can be blocked
const BANDS = [0, 0.2, 0.4, 0.6, 0.8, 1.0001]; // confidence buckets

function bucketOf(conf) {
  for (let i = 1; i < BANDS.length; i++) {
    if (conf < BANDS[i]) return { lo: BANDS[i - 1], hi: BANDS[i] };
  }
  return { lo: 0.8, hi: 1 };
}

function policy() {
  const s = JSON.parse(JSON.stringify(require('./trading-journal').report()));
  const cats = s.categories || [];
  const blocked = [], haircuts = [], tables = [];

  for (const c of cats) {
    if (c.closed == null || c.closed === 0) continue;
    if (c.closed >= MIN_BLOCK_SAMPLE && c.expectancyR != null && c.expectancyR <= 0) {
      blocked.push({ category: c.category, closed: c.closed, expectancyR: c.expectancyR, action: 'BLOCK' });
    }
  }

  // bucket analysis needs the raw theses — recompute from journal directly
  // (missing/corrupt file = fresh boot or reset: treat as zero closed theses, never 500)
  let theses = [];
  try {
    const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'trading-journal.json'), 'utf8'));
    theses = Array.isArray(state.theses) ? state.theses : [];
  } catch (e) { theses = []; }
  const closed = theses.filter(t => t.status === 'closed');
  const byCat = {};
  for (const t of closed) (byCat[t.category] = byCat[t.category] || []).push(t);

  for (const [cat, list] of Object.entries(byCat)) {
    const bands = [];
    for (let i = 1; i < BANDS.length; i++) {
      const inBand = list.filter(t => t.confidence >= BANDS[i - 1] && t.confidence < BANDS[i]);
      if (!inBand.length) continue;
      const predicted = inBand.reduce((a, t) => a + t.confidence, 0) / inBand.length;
      const realized = inBand.filter(t => t.outcome === 'win').length / inBand.length;
      const band = { band: Math.round(BANDS[i - 1] * 100) + '-' + Math.round(Math.min(1, BANDS[i]) * 100) + '%', n: inBand.length, predicted: +predicted.toFixed(3), realized: +realized.toFixed(3) };
      if (inBand.length >= MIN_BLOCK_SAMPLE && predicted - realized >= 0.10) {
        band.haircutTo = realized;
        haircuts.push({ category: cat, band: band.band, predicted: band.predicted, realized: band.realized, haircutTo: band.haircutTo });
      }
      bands.push(band);
    }
    const stats = journal.categoryStats(cat);
    tables.push({ category: cat, stats, bands });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    objective: 'calibration, not aspiration: expectancy net of fees must be > 0',
    minBlockSample: MIN_BLOCK_SAMPLE,
    blocked,
    haircuts,
    categories: tables,
    usage: 'gate checks category against blocked[] before ALLOWED; confidence is haircut before Kelly sizing',
  };
  try {
    fs.mkdirSync(path.dirname(POLICY_FILE), { recursive: true });
    fs.writeFileSync(POLICY_FILE, JSON.stringify(out, null, 2));
  } catch (e) {}
  return out;
}

function blockedCategories() {
  try {
    const p = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8'));
    return (p.blocked || []).map(b => b.category);
  } catch (e) { return []; }
}

/** haircut a confidence using the persisted policy (returns adjusted conf). */
function haircutConfidence(category, confidence) {
  try {
    const p = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8'));
    // apply the LARGEST overconfidence gap observed for this category (most conservative)
    let maxGap = 0;
    for (const h of p.haircuts || []) {
      if (h.category === category) maxGap = Math.max(maxGap, h.predicted - h.realized);
    }
    if (maxGap > 0) return Math.max(0.05, +(confidence - maxGap).toFixed(3));
  } catch (e) {}
  return confidence;
}

module.exports = { policy, blockedCategories, haircutConfidence, MIN_BLOCK_SAMPLE };

/**
 * market-regime.js — v16b: data-driven market regime signal for the edge-gate.
 *
 * The edge-gate's `regime.blocked` flag was hardcoded to `false` in the paper
 * loop — so the "operator blocks the market" protection never actually engaged
 * on data. This module turns the 20-quote scan into a regime classification the
 * gate can consume:
 *
 *   bull        — breadth strongly positive (≥60% of top-20 up, median 24h chg > +1%)
 *   bear        — breadth strongly negative (≤40% up, median < -1%)
 *   range/flat  — otherwise
 *   high-vol    — median |24h chg| ≥ 6%  (whipsaw risk; probe sizing should shrink)
 *
 * It is PURE + cheap (operates on already-fetched quotes, no new network call),
 * and its output feeds edgeGate.evaluate() as `regime`, so the same gate that
 * blocks on drawdown now also blocks on a bear regime for long probes.
 *
 * Conservative by design: the signal only ever makes the gate MORE cautious
 * (it can block / shrink a probe; it never unlocks one). That keeps the
 * "fail-closed" contract intact.
 */
'use strict';

const BULL_UP_FRACTION = 0.6;
const BEAR_UP_FRACTION = 0.4;
const MEDIAN_MOVE_PCT = 1.0;      // |median 24h chg| threshold for bull/bear
const HIGH_VOL_MEDIAN_ABS = 6.0;  // median |24h chg| that flags high-vol / whipsaw

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * classify(quotes) → {
 *   regime: 'bull'|'bear'|'range',
 *   highVol: bool,
 *   upFraction, medianChangePct, medianAbsPct, n,
 *   blockLongs: bool,   // bear → don't open new long probes
 *   blockShorts: bool,  // bull → don't open new short probes
 *   sizeHaircut: 1.0 | 0.5,  // high-vol → halve probe risk
 *   summary: string
 * }
 */
function classify(quotes) {
  const qs = Array.isArray(quotes) ? quotes.filter(q => q && Number.isFinite(q.change24h)) : [];
  const n = qs.length;
  if (!n) {
    return { regime: 'range', highVol: false, upFraction: 0, medianChangePct: 0, medianAbsPct: 0, n: 0, blockLongs: false, blockShorts: false, sizeHaircut: 1.0, summary: 'no data (neutral)' };
  }
  const ups = qs.filter(q => q.change24h > 0).length;
  const upFraction = +(ups / n).toFixed(3);
  const medianChangePct = +median(qs.map(q => q.change24h)).toFixed(3);
  const medianAbsPct = +median(qs.map(q => Math.abs(q.change24h))).toFixed(3);
  const highVol = medianAbsPct >= HIGH_VOL_MEDIAN_ABS;

  let regime = 'range';
  if (upFraction >= BULL_UP_FRACTION && medianChangePct > MEDIAN_MOVE_PCT) regime = 'bull';
  else if (upFraction <= BEAR_UP_FRACTION && medianChangePct < -MEDIAN_MOVE_PCT) regime = 'bear';

  // directional protection: against-trend probes are the dangerous ones
  const blockLongs = regime === 'bear';
  const blockShorts = regime === 'bull';
  const sizeHaircut = highVol ? 0.5 : 1.0;

  return {
    regime, highVol, upFraction, medianChangePct, medianAbsPct, n,
    blockLongs, blockShorts, sizeHaircut,
    summary: `${regime} (up ${upFraction} · med ${medianChangePct}% · ${n} quotes${highVol ? ' · HIGH-VOL' : ''})`,
  };
}

/**
 * Should the gate block a NEW probe of this side, given the regime?
 * (Used by the paper loop before building a thesis — avoids opening a long in a
 *  bear tape or a short in a bull tape.)
 */
function shouldBlockProbe(side, regime) {
  if (!regime) return false;
  if (side === 'long' && regime.blockLongs) return true;
  if (side === 'short' && regime.blockShorts) return true;
  return false;
}

module.exports = {
  classify, shouldBlockProbe,
  BULL_UP_FRACTION, BEAR_UP_FRACTION, MEDIAN_MOVE_PCT, HIGH_VOL_MEDIAN_ABS,
};

/**
 * monetization.js — v16c: turn every free touchpoint into a payment conversation.
 *
 * The whole system already has the ingredients (84 paid tools, 4 subscription
 * tiers, x402 pay-per-call). What was missing is the CONVERSATION: free
 * endpoints return data but never tell the visitor the price, so the funnel
 * never closes. This module generates the "here's what you'd pay, here's when
 * a subscription beats pay-per-call" payload that every free surface embeds.
 *
 * It is pure (no fs, no network) so it can't break a route.
 */
'use strict';

const subs = require('./subscription-manager');

// pay-per-call prices mirror PRICE_MAP in x402-v4 (kept in sync; single source
// for the CONVERSATION math is here so the sample/pricing pages always agree)
const PAY_PER_CALL = {
  hotlist: 0.05, search: 0.05, full: 0.50,
  daily_report: 0.25, market_scan: 0.10, trend_predict: 0.15,
};

/**
 * payback(tierId, callsPerMonth) → how many months until a $X/mo subscription
 * costs LESS than calling pay-per-call that many times a month.
 * Returns the crossover in calls/month where subscription wins.
 */
function paybackCrossover(tierId, perCallUsd) {
  const t = subs.TIERS[tierId];
  if (!t || !(perCallUsd > 0)) return null;
  // sub covers t.dailyCalls/day * 30 = t.dailyCalls*30 calls/month for t.priceUsd
  // pay-per-call covers the same calls for (t.dailyCalls*30) * perCall
  const monthlyCalls = t.dailyCalls * 30;
  const ppcMonthly = monthlyCalls * perCallUsd;
  return {
    tier: t.id, tierName: t.label || t.id, priceUsd: t.priceUsd,
    monthlyCalls, payPerCallMonthlyUsd: +ppcMonthly.toFixed(2),
    savingsMonthlyUsd: +(ppcMonthly - t.priceUsd).toFixed(2),
    breakevenCallsPerMonth: Math.ceil(t.priceUsd / perCallUsd),
  };
}

/**
 * offerFor(endpoint, callsPerMonthEstimate) → the paywall conversation for a
 * single free call. "If you call ~N times/month, the $X tier saves you $Y."
 */
function offerFor(endpoint, callsPerMonth = 30) {
  const perCall = PAY_PER_CALL[endpoint];
  if (perCall == null) return { endpoint, note: 'no pay-per-call price for this endpoint' };
  const ppcMonthly = +(perCall * callsPerMonth).toFixed(2);
  const candidates = subs.TIERS;
  const recs = Object.keys(candidates)
    .filter(id => (candidates[id].endpoints || []).includes(endpoint) || candidates[id].unlimited)
    .map(id => ({ id, ...paybackCrossover(id, perCall) }))
    .filter(r => r.savingsMonthlyUsd != null && r.savingsMonthlyUsd > 0);
  // Recommend the CHEAPEST tier whose capacity covers the user's volume. Only
  // step up a tier when the user's monthly calls actually exceed the cheaper
  // tier's capacity (avoids pushing a 30-call user to the 99/900-call tier).
  recs.sort((a, b) => a.priceUsd - b.priceUsd);
  // Cheapest tier that still saves money AND has enough capacity for the user's
  // volume. Light user (10/mo) on hotlist → trend-digest ($2) not all-access ($99).
  // Only escalate when the user's calls outstrip the cheaper tier's monthly capacity.
  const byPrice = [...recs].sort((a, b) => a.priceUsd - b.priceUsd);
  // Among the positive-savers, pick the cheapest one whose capacity covers the
  // user's volume. If the user's pay-per-call bill is already below the cheapest
  // tier's price, no subscription actually saves money → recommend null (let
  // pay-per-call win) instead of upselling the $99 tier to a $0.50/mo user.
  const cheapestCovering = byPrice.find(r => r.unlimited || r.monthlyCalls >= callsPerMonth);
  const recommend = (cheapestCovering && cheapestCovering.priceUsd < ppcMonthly) ? cheapestCovering : null;
  return {
    endpoint,
    perCallUsd: perCall,
    estMonthlyCalls: callsPerMonth,
    estPayPerCallMonthly: ppcMonthly,
    recommend,
    allOptions: recs.sort((a, b) => b.savingsMonthlyUsd - a.savingsMonthlyUsd),
    cta: recommend
      ? `Subscribe ${recommend.tierName} ($${recommend.priceUsd}/mo) and stop paying $${perCall} per call — you'd save ~$${recommend.savingsMonthlyUsd}/mo.`
      : `Heavy use? A subscription beats $${perCall}/call. See /api/subscribe/plans.`,
  };
}

/** all plans + which pay-per-call price each replaces (for a pricing page). */
function pricingConversation() {
  return {
    payPerCall: PAY_PER_CALL,
    tiers: subs.listTiers(),
    crossover: Object.keys(PAY_PER_CALL).map(ep => ({ endpoint: ep, ...offerFor(ep, 30) })),
  };
}

module.exports = { PAY_PER_CALL, paybackCrossover, offerFor, pricingConversation };

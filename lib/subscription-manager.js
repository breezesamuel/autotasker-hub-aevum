/**
 * subscription-manager.js — v15b: recurring revenue via auto-billed subscriptions.
 *
 * Each subscription is a USDC prepaid credit pool:
 *   - User pays upfront via x402 (txHash proves payment)
 *   - System auto-charges the pool daily/weekly for 3 new data calls
 *   - When pool runs dry, subscription auto-pauses (fail-closed, no surprise bills)
 *
 * Pricing tiers (all in USDC, settled on Base mainnet):
 *   tier-1  "Trend Digest"     $2.00/month  → daily /api/x402/daily_report (30 calls/mo)
 *   tier-2  "Market Pulse"     $5.00/month  → daily /api/x402/market_scan  (30 calls/mo)
 *   tier-3  "Full Stack"      $15.00/month → all 3 new endpoints (60 calls/mo)
 *
 * The subscription is a prepaid balance, not a recurring charge:
 *   - No exchange keys, no card, no external billing
 *   - Each daily cron tick deducts 3 "credit units" from the wallet's pool
 *   - Pool goes to zero → subscription auto-pauses → alert to user via webhook
 *
 * State: data/subscriptions.json
 *
 * Endpoints (wired in x402-v4.js):
 *   POST /api/subscribe/create  — create sub (x402 payment required)
 *   GET  /api/subscribe/status  — check sub state (free, wallet query)
 *   POST /api/subscribe/auto-bill — called by cron, deducts daily credits
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB_FILE = path.join(ROOT, 'data', 'subscriptions.json');

const TIERS = {
  'trend-digest': { priceUsd: 2.00,  dailyCalls: 1,  endpoints: ['daily_report'], label: 'Trend Digest' },
  'market-pulse': { priceUsd: 5.00,  dailyCalls: 3,  endpoints: ['market_scan'], label: 'Market Pulse' },
  'full-stack':   { priceUsd: 15.00, dailyCalls: 10, endpoints: ['daily_report', 'market_scan', 'trend_predict'], label: 'Full Stack' },
  // High-ticket: full API access (all 6 paid endpoints + util calls) + history + weekly report.
  // dailyCalls here = base entitlement; all-access is treated as "unlimited within fair-use"
  // and the weekly report / history access are entitlement flags (not per-call).
  'all-access':   { priceUsd: 99.00, dailyCalls: 100, endpoints: ['hotlist', 'search', 'full', 'daily_report', 'market_scan', 'trend_predict'], label: 'All Access', entitlements: { unlimitedUtil: true, historicalData: true, weeklyReport: true } },
};
// Map a tier's per-call price for display / per-call cost math
const ALL_ACCESS_UNLIMITED = new Set(['all-access']);

function load() {
  try { return JSON.parse(fs.readFileSync(SUB_FILE, 'utf8')); }
  catch (e) { return { version: 1, subs: [], stats: { totalActive: 0, totalPaused: 0, totalRevenueUsd: 0 } }; }
}
function save(db) {
  try {
    fs.mkdirSync(path.dirname(SUB_FILE), { recursive: true });
    fs.writeFileSync(SUB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {}
}

function createSubscription(wallet, tier, txHash) {
  const t = TIERS[tier];
  if (!t) return { ok: false, reason: 'invalid tier', valid: Object.keys(TIERS) };
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return { ok: false, reason: 'invalid wallet' };
  if (!txHash) return { ok: false, reason: 'txHash required (payment proof)' };
  // CRITICAL: verify the txHash is a REAL settled payment to us before granting 30 days.
  // A fabricated txHash would otherwise grant free credits (arbitrary self-service).
  let verified = false;
  try {
    const pay = require('./payments');
    const ledger = pay.loadLedger();
    verified = (ledger.entries || []).some(e => e.txHash === txHash);
  } catch (e) { verified = false; }
  if (!verified) return { ok: false, reason: 'txHash not found in payment ledger — must complete the x402 payment first' };

  const db = load();
  const w = wallet.toLowerCase();
  // idempotency: a single on-chain payment (txHash) can fund exactly one subscription.
  // A retried x402 settlement re-invoking this endpoint must not create a 2nd sub
  // or double the revenue stat.
  if (db.subs.some(s => s.txHash === txHash)) return { ok: false, reason: 'txHash already used', };
  const dup = db.subs.find(s => s.wallet === w && s.tier === tier && s.active);
  if (dup) return { ok: false, reason: 'already active at this tier' };

  const costUsd = +t.priceUsd.toFixed(2);
  const now = new Date();
  const unlimited = ALL_ACCESS_UNLIMITED.has(tier);
  const sub = {
    id: 'sub_' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
    wallet: w,
    tier,
    priceUsd: costUsd,
    txHash,
    dailyCalls: t.dailyCalls,
    unlimited: unlimited,
    entitlements: t.entitlements || null,
    endpoints: t.endpoints,
    creditsRemaining: t.dailyCalls * 30, // 30 days of daily calls
    active: true,
    pausedAt: null,
    createdAt: now.toISOString(),
    lastBilledAt: now.toISOString(), // creation day counts as day 1 — autoBill skips same-day
  };
  db.subs.unshift(sub);
  db.stats.totalActive++;
  db.stats.totalRevenueUsd = +(Number(db.stats.totalRevenueUsd || 0) + costUsd).toFixed(2);
  save(db);
  return { ok: true, sub, costUsd, expiresInDays: 30 };
}

/**
 * consumeCredit — decrement a wallet's subscription credit pool by n (accounting
 * for a pre-paid mirror call). The pre-paid endpoint already verified the wallet
 * has credits; this is the ledger write. all-access (unlimited) is a no-op.
 */
function consumeCredit(wallet, n = 1) {
  const db = load();
  const w = (wallet || '').toLowerCase();
  const sub = db.subs.find(s => s.wallet === w && s.active && !s.unlimited);
  if (!sub) return { ok: false, reason: 'no billable subscription to charge' };
  sub.creditsRemaining = Math.max(0, (sub.creditsRemaining || 0) - n);
  if (sub.creditsRemaining === 0) {
    sub.active = false;
    sub.pausedAt = new Date().toISOString();
    db.stats.totalActive = Math.max(0, db.stats.totalActive - 1);
    db.stats.totalPaused++;
  }
  save(db);
  return { ok: true, creditsRemaining: sub.creditsRemaining, active: sub.active };
}

/** renew — top up a paused/expired sub with a fresh payment. */
function listTiers() {
  return Object.entries(TIERS).map(([id, t]) => ({
    id,
    name: t.label || id,
    priceUsd: t.priceUsd,
    dailyCalls: t.dailyCalls,
    unlimited: ALL_ACCESS_UNLIMITED.has(id),
    endpoints: t.endpoints,
    entitlements: t.entitlements || null,
    perCall: ALL_ACCESS_UNLIMITED.has(id) ? 'unlimited' : +(t.priceUsd / (t.dailyCalls * 30)).toFixed(4),
  }));
}
function renew(wallet, tier, txHash) {
  const db = load();
  const w = (wallet || '').toLowerCase();
  const t = TIERS[tier];
  if (!t) return { ok: false, reason: 'invalid tier', valid: Object.keys(TIERS) };
  if (db.subs.some(s => s.txHash === txHash)) return { ok: false, reason: 'txHash already used' };
  // verify the renewal payment is a real settled tx (same guard as create)
  let verified = false;
  try {
    const pay = require('./payments');
    verified = (pay.loadLedger().entries || []).some(e => e.txHash === txHash);
  } catch (e) {}
  if (!verified) return { ok: false, reason: 'txHash not found in payment ledger — must complete the x402 payment first' };
  const sub = db.subs.find(s => s.wallet === w && s.tier === tier);
  if (!sub) return createSubscription(wallet, tier, txHash);
  sub.active = true;
  sub.pausedAt = null;
  sub.creditsRemaining = t.dailyCalls * 30;
  sub.lastBilledAt = new Date().toISOString();
  sub.renewedAt = new Date().toISOString();
  db.stats.totalActive++;
  db.stats.totalPaused = Math.max(0, db.stats.totalPaused - 1);
  db.stats.totalRevenueUsd = +(Number(db.stats.totalRevenueUsd || 0) + t.priceUsd).toFixed(2);
  save(db);
  return { ok: true, sub, costUsd: t.priceUsd, extendedDays: 30 };
}

function status(wallet) {
  const db = load();
  const w = (wallet || '').toLowerCase();
  const subs = db.subs.filter(s => s.wallet === w);
  if (!subs.length) return { ok: true, active: false, subs: [], note: 'no subscription for this wallet' };
  const activeSubs = subs.filter(s => s.active);
  return { ok: true, active: activeSubs.length > 0, subs, activeSubs, stats: db.stats };
}

/**
 * autoBill — called by the daily cron. For each active sub:
 *   - skip if billed today (creation or last run) — day-1 free
 *   - deduct dailyCalls credits
 *   - if credits hit 0 → auto-pause (fail-closed, no surprise bill)
 */
function autoBill() {
  const db = load();
  const today = new Date().toISOString().slice(0, 10);
  let billed = 0, paused = 0;
  for (const s of db.subs) {
    if (!s.active) continue;
    const t = TIERS[s.tier];
    if (!t) continue;
    // day-1 free: don't bill on the same day the sub was created or last billed
    if (String(s.lastBilledAt || '').slice(0, 10) === today) continue;
    s.creditsRemaining -= t.dailyCalls;
    if (s.creditsRemaining <= 0) {
      s.creditsRemaining = 0;
      s.active = false;
      s.pausedAt = new Date().toISOString();
      db.stats.totalActive--;
      db.stats.totalPaused++;
      paused++;
    }
    s.lastBilledAt = new Date().toISOString();
    billed++;
  }
  if (billed || paused) save(db);
  return { billed, paused, totalActive: db.stats.totalActive, date: today };
}

module.exports = { TIERS, ALL_ACCESS_UNLIMITED, createSubscription, renew, status, autoBill, consumeCredit, listTiers };

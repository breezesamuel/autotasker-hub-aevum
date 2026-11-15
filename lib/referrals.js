/**
 * referrals.js — 系统分销 / 推荐返利引擎（honest accounting）
 *
 * Model (single-treasury policy compliant):
 *   - Revenue is ALWAYS 100% of the settled payment (matches on-chain reality).
 *   - A referral rebate is an EXPENSE LIABILITY (default 10%), accrued when a
 *     payer wallet that claimed a referral code settles a payment.
 *   - Rebates are paid directly from the treasury on-chain (user signs); no
 *     third-party pool ever touches the money.
 *
 * Storage: data/referrals.json — append-only streams: codes / clicks / claims /
 * attributed / payouts. Every claim and payout carries evidence (wallet, tx).
 *
 * Public API:
 *   newCode(ip)              -> {code, link}         (rate limited by caller)
 *   trackClick(code, meta)   -> {ok}
 *   claim(code, wallet)      -> {ok, code, wallet}
 *   attributePayment(p)      -> {ok, code, rebateUsd} | {ok:false}
 *   stats(code)              -> per-code dashboard numbers
 *   summary()                -> engine-wide numbers for /api/ref/health
 *   payoutPlan(minUsd)       -> grouped pending rebates ready for the treasury to pay
 *   recordPayout(wallet, amountUsd, txHash) -> clears the liability (FIFO)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'data', 'referrals.json');

const REBATE_BPS = Number(process.env.REFERRAL_REBATE_BPS || 1000); // 10% of payment
const MIN_PAYOUT_USD = Number(process.env.REFERRAL_MIN_PAYOUT_USD || 1.0);
const CLICK_CAP = 5000;     // per-file stream caps (prevent unbounded growth)
const ATTRIB_CAP = 5000;

// Wallets that may never claim (operator / treasury — no self-dealing)
const BLOCKED_WALLETS = new Set([
  '0xb9a9e6d9c4ad1635aa685bba2e235a515a94773c', // treasury
  '0x74a9f91763c28571af7a52987f425f62825cf5d8', // house relayer
  '0x367f1b3d8ca90d1e087481a9a40d585bf3451a03', // legacy platform wallet
  '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38', // GENESIS identity wallet
  '0xfc24fd34da9e49a0110dcaee3ad30ec54175ebb3', // legacy payTo
]);

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/0/1 (human-safe)
const IP_SALT = 'atref-ip-v1';

function sha(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16); }
function ipHash(ip) { return sha(IP_SALT + String(ip || '')); }
function normWallet(w) { return String(w || '').trim().toLowerCase(); }
function isWallet(w) { return /^0x[0-9a-fA-F]{40}$/.test(String(w || '').trim()); }
function usd(n) { return Number(n).toFixed(6); }

let cache = null;
let cacheMtime = 0;

function load() {
  // Cross-process safety: CLI scripts (payout record, attribution tests) write the
  // same file — reload whenever the file is newer than our cache.
  let mtime = 0;
  try { mtime = fs.statSync(FILE).mtimeMs; } catch (e) {}
  if (cache && mtime === cacheMtime) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    cache = {
      version: 1,
      createdAt: new Date().toISOString(),
      rebateBps: REBATE_BPS,
      minPayoutUsd: MIN_PAYOUT_USD,
      codes: {},       // CODE -> {createdAt, ownerWallet|null, note}
      clicks: [],      // {at, code, ip, ua, referer}
      claims: [],      // {at, code, wallet, ip}
      attributed: [],  // {at, code, wallet, amountUsd, rebateUsd, txHash, endpoint}
      payouts: [],     // {at, code, wallet, amountUsd, txHash}
    };
    save();
  }
  cache.rebateBps = cache.rebateBps || REBATE_BPS;
  cache.minPayoutUsd = cache.minPayoutUsd || MIN_PAYOUT_USD;
  cacheMtime = mtime;
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('[referrals] persist failed:', e.message);
  }
}

function pushCapped(arr, item, cap) {
  arr.push(item);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}

// ── Code lifecycle ───────────────────────────────────────────────────────────

function newCode(ip, note) {
  const db = load();
  let code;
  do {
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    code = 'AT' + s;
  } while (db.codes[code]);
  db.codes[code] = { createdAt: new Date().toISOString(), ownerWallet: null, note: note || null, ipHash: ipHash(ip) };
  save();
  return { code, link: '/r/' + code, rebateBps: db.rebateBps, minPayoutUsd: db.minPayoutUsd };
}

function trackClick(code, meta) {
  const db = load();
  if (!db.codes[code]) return { ok: false, reason: 'unknown code' };
  pushCapped(db.clicks, {
    at: new Date().toISOString(),
    code,
    ip: ipHash(meta && meta.ip),
    ua: String((meta && meta.ua) || '').slice(0, 120),
    referer: String((meta && meta.referer) || '').slice(0, 200),
  }, CLICK_CAP);
  save();
  return { ok: true };
}

function claim(code, wallet, ip) {
  const db = load();
  const w = normWallet(wallet);
  if (!isWallet(w)) return { ok: false, reason: 'invalid wallet address' };
  if (!db.codes[code]) return { ok: false, reason: 'unknown code' };
  if (BLOCKED_WALLETS.has(w)) return { ok: false, reason: 'operator/treasury wallets cannot claim' };
  const existing = db.claims.find((c) => c.wallet === w);
  if (existing && existing.code !== code) {
    return { ok: false, reason: `wallet already bound to code ${existing.code} (first binding wins)` };
  }
  if (existing) return { ok: true, code: existing.code, wallet: w, already: true };
  db.claims.push({ at: new Date().toISOString(), code, wallet: w, ip: ipHash(ip) });
  db.codes[code].ownerWallet = w;
  save();
  return { ok: true, code, wallet: w };
}

function walletCode(wallet) {
  const w = normWallet(wallet);
  const hit = load().claims.find((c) => c.wallet === w);
  return hit ? hit.code : null;
}

// ── Attribution (called after every successful x402 settlement) ──────────────

function attributePayment({ payerWallet, amountUsd, txHash, endpoint }) {
  const db = load();
  const w = normWallet(payerWallet);
  if (!isWallet(w) || !(Number(amountUsd) > 0)) return { ok: false, reason: 'bad input' };
  const code = walletCode(w);
  if (!code) return { ok: false, reason: 'payer has no referral binding' };
  if (txHash && db.attributed.some((a) => a.txHash === txHash)) {
    return { ok: false, reason: 'tx already attributed (idempotent)' };
  }
  const rebateUsd = Number((Number(amountUsd) * db.rebateBps / 10000).toFixed(6));
  pushCapped(db.attributed, {
    at: new Date().toISOString(), code, wallet: w,
    amountUsd: Number(amountUsd), rebateUsd, txHash: txHash || null,
    endpoint: endpoint || null,
  }, ATTRIB_CAP);
  save();
  return { ok: true, code, rebateUsd };
}

// ── Reporting ────────────────────────────────────────────────────────────────

function stats(code) {
  const db = load();
  if (!db.codes[code]) return { ok: false, reason: 'unknown code' };
  const clicks = db.clicks.filter((c) => c.code === code).length;
  const uniqueIps = new Set(db.clicks.filter((c) => c.code === code).map((c) => c.ip)).size;
  const attributed = db.attributed.filter((a) => a.code === code);
  const paidForCode = db.payouts.filter((p) => p.code === code);
  const attributedUsd = attributed.reduce((s, a) => s + a.amountUsd, 0);
  const rebateUsd = attributed.reduce((s, a) => s + a.rebateUsd, 0);
  const paidUsd = paidForCode.reduce((s, p) => s + p.amountUsd, 0);
  return {
    ok: true,
    code,
    ownerWallet: db.codes[code].ownerWallet,
    createdAt: db.codes[code].createdAt,
    clicks, uniqueVisitors: uniqueIps,
    walletsClaimed: db.claims.filter((c) => c.code === code).length,
    attributedPayments: attributed.length,
    attributedRevenueUsd: usd(attributedUsd),
    rebateAccruedUsd: usd(rebateUsd),
    rebatePaidUsd: usd(paidUsd),
    rebatePendingUsd: usd(Math.max(0, rebateUsd - paidUsd)),
    rebateBps: db.rebateBps,
  };
}

function summary() {
  const db = load();
  const pendingByWallet = {};
  for (const a of db.attributed) {
    pendingByWallet[a.wallet] = (pendingByWallet[a.wallet] || 0) + a.rebateUsd;
  }
  for (const p of db.payouts) pendingByWallet[p.wallet] = (pendingByWallet[p.wallet] || 0) - p.amountUsd;
  let pendingUsd = 0;
  const wallets = [];
  for (const [w, v] of Object.entries(pendingByWallet)) {
    if (v > 0.000001) { pendingUsd += v; wallets.push({ wallet: w, pendingUsd: usd(v) }); }
  }
  return {
    codes: Object.keys(db.codes).length,
    clicks: db.clicks.length,
    claims: db.claims.length,
    attributedPayments: db.attributed.length,
    attributedRevenueUsd: usd(db.attributed.reduce((s, a) => s + a.amountUsd, 0)),
    rebatesPendingUsd: usd(pendingUsd),
    rebatesPaidUsd: usd(db.payouts.reduce((s, p) => s + p.amountUsd, 0)),
    rebateBps: db.rebateBps,
    minPayoutUsd: db.minPayoutUsd,
  };
}

// ── Payout plan / settlement (treasury-direct; the user signs) ───────────────

function payoutPlan() {
  const db = load();
  const accrued = {};   // wallet -> [{...rebate entries pending}]
  for (const a of db.attributed) (accrued[a.wallet] = accrued[a.wallet] || []).push(a);
  const rows = [];
  for (const [w, list] of Object.entries(accrued)) {
    const paidSum = db.payouts.filter((p) => p.wallet === w).reduce((s, p) => s + p.amountUsd, 0);
    let remaining = paidSum;
    const pending = [];
    for (const a of list) { // FIFO: oldest rebates get consumed by past payouts first
      if (remaining >= a.rebateUsd - 1e-9) { remaining -= a.rebateUsd; continue; }
      pending.push(a);
    }
    if (!pending.length) continue;
    const amount = pending.reduce((s, a) => s + a.rebateUsd, 0);
    if (amount >= db.minPayoutUsd) {
      rows.push({
        wallet: w, code: pending[0].code,
        amountUsd: usd(amount), rebates: pending.length,
        entries: pending.map((a) => ({ at: a.at, amountUsd: a.amountUsd, rebateUsd: a.rebateUsd, txHash: a.txHash })),
      });
    }
  }
  const total = usd(rows.reduce((s, r) => s + Number(r.amountUsd), 0));
  return {
    generatedAt: new Date().toISOString(),
    treasuryOnly: true,
    note: 'pay each wallet directly from the treasury with a plain USDC transfer; then: node scripts/referral-payout.js --record <wallet> <amount> <txHash>',
    totalUsd: total,
    transfers: rows,
  };
}

function recordPayout(wallet, amountUsd, txHash) {
  const db = load();
  const w = normWallet(wallet);
  if (!isWallet(w)) return { ok: false, reason: 'invalid wallet' };
  db.payouts.push({
    at: new Date().toISOString(), code: walletCode(w), wallet: w,
    amountUsd: Number(amountUsd), txHash,
  });
  save();
  return { ok: true, wallet: w, amountUsd: Number(amountUsd), txHash };
}

module.exports = {
  newCode, trackClick, claim, walletCode, attributePayment,
  stats, summary, payoutPlan, recordPayout,
  BLOCKED_WALLETS,
  isWallet, ipHash, normWallet,
  REBATE_BPS, MIN_PAYOUT_USD,
};

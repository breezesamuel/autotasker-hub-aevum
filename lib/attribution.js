/**
 * attribution.js — v13: multi-touch attribution engine.
 *
 * Answers the only question that matters at ~1 sale/day:
 *   "Which content page / channel / referral actually PRODUCED each settlement?"
 *
 * Touch sources stitched:
 *   - referrals.json   → code clicks + attributed payments (channel: referral)
 *   - content-stats    → topic page generations/traffic (channel: content:<slug>)
 *   - payments ledger  → settlements (the conversions we attribute)
 *   - channel-stats    → external channel markers (hn/reddit/telegram)
 *
 * Model: FIRST-touch 50% + LAST-touch 50% (simple, robust at low volume).
 * Every settlement gets credited to a chain of touches recorded in
 * data/attribution.json, keyed by wallet+day window (24h lookback).
 *
 * API:
 *   recordTouch({type, id, wallet, channel})   — called from page/referral hooks
 *   attributeSettlement({wallet, tool, usd, ts}) — called from onAfterSettle
 *   getChannelROI()   — channel → settlements, usd, first/last credit split
 *   getContentROI()   — content slug → settlements, usd
 *   report()          — full report for /ops
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'data', 'attribution.json');
const LOOKBACK_MS = 24 * 3600 * 1000; // 24h touch window

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (e) {
    return {
      version: 1,
      touches: [],          // {ts, type, id, channel, wallet}
      settlements: [],      // {ts, wallet, tool, usd, credits:{first, last}}
      stats: { totalTouches: 0, totalSettlements: 0, attributedUsd: 0, unattributedUsd: 0 },
    };
  }
}
function saveState(s) {
  try {
    if (s.touches.length > 5000) s.touches = s.touches.slice(-5000);
    if (s.settlements.length > 2000) s.settlements = s.settlements.slice(-2000);
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e) {}
}

function recordTouch(touch) {
  if (!touch || !touch.channel) return { ok: false, reason: 'channel required' };
  const s = loadState();
  const t = {
    ts: touch.ts || new Date().toISOString(),
    type: touch.type || 'visit',           // visit | click | view | register
    id: touch.id || null,                  // content slug / referral code / post id
    channel: String(touch.channel).slice(0, 60),
    wallet: (touch.wallet || '').toLowerCase() || null,
  };
  s.touches.push(t);
  s.stats.totalTouches++;
  saveState(s);
  return { ok: true, touchCount: s.touches.length };
}

// find touches for wallet within lookback; NO anonymous fallback —
// unverified window attribution pollutes ROI data (v13 unit test lesson)
function findTouches(s, wallet, ts) {
  const t = new Date(ts).getTime();
  const cutoff = t - LOOKBACK_MS;
  const walletTouches = s.touches.filter(x => {
    const xt = new Date(x.ts).getTime();
    return xt >= cutoff && xt <= t && x.wallet && x.wallet === wallet;
  });
  return { list: walletTouches, matched: walletTouches.length ? 'wallet' : 'none' };
}

function attributeSettlement(st) {
  st = st || {};
  const wallet = (st.wallet || '').toLowerCase();
  const usd = Number(st.usd) || 0;
  const ts = st.ts || new Date().toISOString();
  const s = loadState();

  // PRIMARY idempotency: txHash (live path + backfill both pass it; restarts
  // re-run the backfill and previously could re-add every live-recorded
  // settlement because the fingerprint ts differs by milliseconds).
  if (st.txHash) {
    const dupe = s.settlements.find(x => x.txHash && x.txHash === st.txHash);
    if (dupe) return { ok: false, reason: 'already attributed (txHash)', attribution: dupe };
  }

  const { list, matched } = findTouches(s, wallet, ts);
  const first = list[0] || null;
  const last = list[list.length - 1] || null;

  const rec = {
    ts, wallet: wallet ? wallet.slice(0, 10) + '…' + wallet.slice(-4) : null,
    tool: st.tool || null, usd, txHash: st.txHash || null,
    matched, // 'wallet' | 'window' | 'none'
    credits: {
      first: first ? { channel: first.channel, id: first.id } : null,
      last: last ? { channel: last.channel, id: last.id } : null,
    },
  };
  s.settlements.push(rec);
  s.stats.totalSettlements++;
  if (first || last) s.stats.attributedUsd += usd; else s.stats.unattributedUsd += usd;
  saveState(s);
  return { ok: true, attribution: rec };
}

function getChannelROI(limit) {
  const s = loadState();
  const byChannel = {};
  for (const st of s.settlements) {
    const usd = st.usd || 0;
    for (const slot of ['first', 'last']) {
      const c = st.credits[slot];
      if (!c) continue;
      const k = c.channel + (c.id ? ':' + c.id : '');
      byChannel[k] = byChannel[k] || { channel: c.channel, touch: c.id || null, settlements: 0, usdFirst: 0, usdLast: 0 };
      byChannel[k].settlements++;
      byChannel[k][slot === 'first' ? 'usdFirst' : 'usdLast'] += usd;
    }
  }
  const rows = Object.values(byChannel)
    .map(r => ({ ...r, usdFirst: +r.usdFirst.toFixed(4), usdLast: +r.usdLast.toFixed(4), totalCredit: +(r.usdFirst + r.usdLast).toFixed(4) }))
    .sort((a, b) => b.totalCredit - a.totalCredit)
    .slice(0, limit || 15);
  return { model: 'first-50%+last-50%', lookbackHours: 24, channels: rows };
}

function getContentROI(limit) {
  const s = loadState();
  const bySlug = {};
  for (const st of s.settlements) {
    for (const slot of ['first', 'last']) {
      const c = st.credits[slot];
      if (c && c.channel && c.channel.indexOf('content:') === 0) {
        const slug = c.id || 'unknown';
        bySlug[slug] = bySlug[slug] || { slug, settlements: 0, usd: 0 };
        bySlug[slug].settlements++;
        bySlug[slug].usd += (st.usd || 0) / 2;
      }
    }
  }
  const rows = Object.values(bySlug).map(r => ({ ...r, usd: +r.usd.toFixed(4) })).sort((a, b) => b.usd - a.usd).slice(0, limit || 10);
  return { model: 'first-50%+last-50%', contentPages: rows };
}

function report() {
  const s = loadState();
  return {
    stats: {
      totalTouches: s.stats.totalTouches,
      totalSettlements: s.stats.totalSettlements,
      attributedUsd: +s.stats.attributedUsd.toFixed(4),
      unattributedUsd: +s.stats.unattributedUsd.toFixed(4),
      attributionRate: s.stats.totalSettlements
        ? ((s.stats.attributedUsd / (s.stats.attributedUsd + s.stats.unattributedUsd || 1)) * 100).toFixed(1) + '%'
        : 'n/a',
    },
    channelROI: getChannelROI(),
    contentROI: getContentROI(),
    recentSettlements: s.settlements.slice(-10).reverse(),
  };
}

// Backfill: attribute existing ledger settlements to whatever touches exist
function backfillFromLedger() {
  const s = loadState();
  let added = 0;
  try {
    const pay = require('./payments');
    const ledger = pay.loadLedger();
    // primary key: txHash (idempotent across restarts); fingerprint fallback for legacy rows
    const knownTx = new Set(s.settlements.filter(x => x.txHash).map(x => x.txHash));
    const knownFp = new Set(s.settlements.map(x => x.ts + '|' + x.tool + '|' + x.usd));
    for (const e of (ledger.entries || [])) {
      if (e.txHash && knownTx.has(e.txHash)) continue;
      const key = (e.ts || '') + '|' + (e.tool || '') + '|' + (e.priceUsd || 0);
      if (knownFp.has(key)) continue;
      const r = attributeSettlement({ wallet: e.agentWallet, tool: e.tool, usd: e.priceUsd, ts: e.ts, txHash: e.txHash || null });
      if (r.ok) {
        added++;
        knownFp.add(key);
        if (e.txHash) knownTx.add(e.txHash);
      }
    }
  } catch (e) { return { ok: false, reason: e.message }; }
  return { ok: true, added };
}

module.exports = { recordTouch, attributeSettlement, getChannelROI, getContentROI, report, backfillFromLedger };

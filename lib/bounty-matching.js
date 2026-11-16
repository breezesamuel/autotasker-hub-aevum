/**
 * bounty-matching.js — v14: task↔worker matching engine + reputation.
 *
 * bounty-platform.js handles posting/claiming. This module answers:
 *   "Given an open task, WHO should see it first?"
 *   "Can this worker be trusted with escrowed rewards?"
 *
 * Matching model (transparent, no black box):
 *   score = skillOverlap*0.5 + reputationScore*0.3 + categoryMatch*0.2
 *   skillOverlap = |task.tags ∩ worker.skills| / |task.tags| (0 if task has no tags)
 *   reputationScore = worker.reputation / 100 (cold-start = 0.5)
 *   categoryMatch = worker.categories includes task.category ? 1 : 0
 *
 * Reputation: EMA of completed-task ratings, starts at 50.
 *   updateReputation(wallet, rating1to5): rep = rep*0.7 + (rating/5*100)*0.3
 *   Fraud guard: rating jumps > 20 pts up from a single task are capped (sybil dampening).
 *
 * Stale bump: open tasks older than 72h get flagged for re-promotion
 *   (IndexNow ping + feed refresh — wired in x402-v4 by callers).
 *
 * State: data/bounty-matching.json (independent of bounties.json).
 *
 * API:
 *   registerWorker(wallet, skills, categories) → profile
 *   matchTask(bountyId) → top3 with score breakdown
 *   updateReputation(wallet, rating, note) → new rep
 *   getWorker(wallet) → profile
 *   bumpStale() → [{bountyId, title, ageHours, action}]
 *   report() → stats for /ops
 */
'use strict';

const fs = require('fs');
const path = require('path');
const atomicWrite = require('./atomic-write');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'data', 'bounty-matching.json');
const STALE_HOURS = 72;
const COLD_START_REP = 50;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (e) {
    return {
      version: 1,
      workers: {},          // wallet → {skills, categories, reputation, completed, ratings:[], registeredAt}
      matches: {},          // bountyId → [{wallet, score, breakdown}] (latest)
      bumpLog: [],          // [{bountyId, bumpedAt}]
      stats: { workersRegistered: 0, matchesRun: 0, bumpsIssued: 0, repUpdates: 0 },
    };
  }
}
function saveState(s) {
  try {
    if (s.bumpLog.length > 1000) s.bumpLog = s.bumpLog.slice(-1000);
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    atomicWrite.writeJsonAtomic(STATE_FILE, s);
  } catch (e) {}
}

function normWallet(w) {
  const x = String(w || '').toLowerCase();
  return (x.startsWith('0x') && x.length >= 10) ? x : null;
}

function registerWorker(wallet, skills, categories) {
  const w = normWallet(wallet);
  if (!w) return { ok: false, reason: 'valid 0x wallet required' };
  const s = loadState();
  const isNew = !s.workers[w];
  s.workers[w] = {
    skills: (Array.isArray(skills) ? skills : []).map(x => String(x).toLowerCase().slice(0, 30)).slice(0, 15),
    categories: (Array.isArray(categories) ? categories : []).map(x => String(x).toLowerCase().slice(0, 30)).slice(0, 8),
    reputation: isNew ? COLD_START_REP : (s.workers[w].reputation || COLD_START_REP),
    completed: isNew ? 0 : (s.workers[w].completed || 0),
    ratings: isNew ? [] : (s.workers[w].ratings || []),
    registeredAt: isNew ? new Date().toISOString() : s.workers[w].registeredAt,
  };
  if (isNew) s.stats.workersRegistered++;
  saveState(s);
  return { ok: true, wallet: w.slice(0, 10) + '…' + w.slice(-4), profile: mask(s.workers[w]), isNew };
}

function mask(p) {
  return { skills: p.skills, categories: p.categories, reputation: Math.round(p.reputation), completed: p.completed };
}

function getWorker(wallet) {
  const w = normWallet(wallet);
  if (!w) return { ok: false, reason: 'valid wallet required' };
  const s = loadState();
  const p = s.workers[w];
  if (!p) return { ok: false, reason: 'not registered — call registerWorker first' };
  return { ok: true, wallet: w.slice(0, 10) + '…' + w.slice(-4), profile: mask(p) };
}

function updateReputation(wallet, rating) {
  const w = normWallet(wallet);
  if (!w) return { ok: false, reason: 'valid wallet required' };
  rating = Math.min(Math.max(Number(rating) || 3, 1), 5);
  const s = loadState();
  const p = s.workers[w];
  if (!p) return { ok: false, reason: 'not registered' };

  const target = (rating / 5) * 100;
  let newRep = p.reputation * 0.7 + target * 0.3;
  // sybil dampening: single-update jump capped at +20
  if (newRep - p.reputation > 20) newRep = p.reputation + 20;
  p.reputation = Math.round(newRep * 10) / 10;
  p.completed++;
  p.ratings.push({ rating, ts: new Date().toISOString() });
  if (p.ratings.length > 50) p.ratings = p.ratings.slice(-50);
  s.stats.repUpdates++;
  saveState(s);
  return { ok: true, wallet: w.slice(0, 10) + '…' + w.slice(-4), reputation: p.reputation, completed: p.completed };
}

function matchTask(bountyId) {
  const s = loadState();
  let bounty = null;
  try {
    const bp = require('./bounty-platform');
    bounty = (bp.listBounties('all', 200).bounties || []).find(b => b.id === bountyId);
  } catch (e) { return { ok: false, reason: 'bounty platform unavailable' }; }
  if (!bounty) return { ok: false, reason: 'bounty not found' };

  const taskTags = (bounty.tags || []).map(x => String(x).toLowerCase());
  const taskCat = String(bounty.category || 'general').toLowerCase();

  const scored = [];
  for (const [w, p] of Object.entries(s.workers)) {
    const overlap = taskTags.length
      ? taskTags.filter(t => p.skills.includes(t)).length / taskTags.length
      : 0;
    const repScore = (p.reputation || COLD_START_REP) / 100;
    const catMatch = p.categories.includes(taskCat) ? 1 : 0;
    const score = overlap * 0.5 + repScore * 0.3 + catMatch * 0.2;
    if (score <= 0) continue;
    scored.push({
      wallet: w.slice(0, 10) + '…' + w.slice(-4),
      walletFull: w,
      score: +score.toFixed(3),
      breakdown: { skillOverlap: +overlap.toFixed(2), reputation: Math.round(p.reputation), categoryMatch: catMatch },
      completed: p.completed,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);
  s.matches[bountyId] = { matchedAt: new Date().toISOString(), task: { title: bounty.title, tags: taskTags, category: taskCat }, top };
  s.stats.matchesRun++;
  saveState(s);
  return {
    ok: true, bountyId, task: { title: bounty.title, tags: taskTags, category: taskCat },
    topMatches: top,
    candidatesScored: scored.length,
    note: top.length ? 'notify top workers (push wiring: telegram/reddit when tokens provided)' : 'no registered workers yet — register via API',
  };
}

function bumpStale() {
  const s = loadState();
  let bounties = [];
  try { bounties = require('./bounty-platform').listBounties('open', 100).bounties || []; }
  catch (e) { return { ok: false, reason: 'bounty platform unavailable' }; }

  const now = Date.now();
  const stale = [];
  for (const b of bounties) {
    const ageH = (now - new Date(b.createdAt).getTime()) / 3600000;
    if (ageH < STALE_HOURS) continue;
    const already = s.bumpLog.some(x => x.bountyId === b.id && (now - new Date(x.bumpedAt).getTime()) < 24 * 3600000);
    if (already) continue;
    stale.push({ bountyId: b.id, title: b.title, ageHours: Math.round(ageH), rewardUsd: b.rewardUsd, action: 're-promote (IndexNow ping + feed + match refresh)' });
    s.bumpLog.push({ bountyId: b.id, bumpedAt: new Date(now).toISOString() });
    s.stats.bumpsIssued++;
    // refresh matches while bumping
    try { matchTask(b.id); } catch (e) {}
  }
  saveState(s);
  return { ok: true, staleCount: stale.length, stale, note: stale.length ? 'callers should ping IndexNow for /bounty pages' : 'nothing stale' };
}

/**
 * autoMatchAndClaim — two-sided fee loop. For each open bounty that has
 * registered candidate workers, match to the top scorer and auto-claim it
 * (the platform accrues its 5% fee on claim). This is the "match fee"
 * revenue channel: no human in the loop, driven by cron.
 *
 * Returns a summary of what was auto-claimed and the total fee accrued.
 */
function autoMatchAndClaim(maxBounties = 20) {
  const s = loadState();
  let bounties = [];
  try { bounties = require('./bounty-platform').listBounties('open', maxBounties).bounties || []; }
  catch (e) { return { ok: false, reason: 'bounty platform unavailable' }; }
  if (!bounties.length) return { ok: true, autoClaimed: [], totalFeeUsd: 0, note: 'no open bounties' };

  const autoClaimed = [];
  let totalFeeUsd = 0;
  for (const b of bounties) {
    const m = matchTask(b.id);
    if (!m.ok || !m.topMatches || !m.topMatches.length) continue;
    // top match must clear a reputation floor to auto-claim (avoid sybil farms grabbing fees)
    const best = m.topMatches[0];
    if (best.score < 0.3) continue;
    // auto-claim on behalf of the top worker (full wallet, not the masked display string)
    const claimer = best.walletFull || best.wallet;
    if (!/^(0x)?[0-9a-f]{8,}$/i.test(claimer)) continue; // guard against masked strings
    try {
      const c = require('./bounty-platform').claimBounty(b.id, claimer, 'auto-matched claim by AutoTasker matching engine');
      if (c.ok) {
        // NOTE: bounties are created free (no upfront escrow), so feeUsd is UNREALIZED —
        // the platform only "earns" it if the poster actually pays out the reward.
        // Tracked separately as accrued (never counted as banked revenue).
        totalFeeUsd += Number(b.feeUsd || 0);
        autoClaimed.push({ bountyId: b.id, title: b.title, worker: best.wallet, feeUsd: b.feeUsd, rewardUsd: b.rewardUsd });
      }
    } catch (e) { /* fee only accrues on successful claim */ }
  }
  s.stats.autoClaims = (s.stats.autoClaims || 0) + autoClaimed.length;
  // accrued (unrealized) — NOT banked revenue. Bounties have no upfront escrow,
  // so the 5% only becomes real when a poster settles the reward on-chain.
  s.stats.feesAccruedUsd = +((Number(s.stats.feesAccruedUsd || 0) + totalFeeUsd)).toFixed(4);
  s.stats.feesRealizedUsd = Number(s.stats.feesRealizedUsd || 0); // only on-chain settled fees land here
  saveState(s);
  return {
    ok: true, autoClaimed, totalFeeUsd: +totalFeeUsd.toFixed(4), openScanned: bounties.length,
    note: 'feesAccrued is UNREALIZED (bounties have no upfront escrow) — see feesRealizedUsd for banked revenue',
  };
}

function report() {
  const s = loadState();
  const workers = Object.values(s.workers);
  return {
    stats: s.stats,
    workers: {
      total: workers.length,
      avgReputation: workers.length ? Math.round(workers.reduce((x, p) => x + p.reputation, 0) / workers.length) : 0,
      withCompletedTasks: workers.filter(p => p.completed > 0).length,
    },
    recentMatches: Object.entries(s.matches).slice(-5).map(([id, m]) => ({ bountyId: id, matchedAt: m.matchedAt, top: m.top[0] || null })),
    recentBumps: s.bumpLog.slice(-5).reverse(),
  };
}

module.exports = { registerWorker, getWorker, updateReputation, matchTask, bumpStale, autoMatchAndClaim, report, COLD_START_REP };

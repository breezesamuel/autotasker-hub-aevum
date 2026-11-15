/**
 * games-engine.js — v12: persistent, provably-fair mini-games.
 *
 * Replaces the stateless TON game stub in payment-integration.js.
 *
 * Fairness protocol (commit-reveal):
 *   Round N: server publishes H = sha256(serverSeed_N) BEFORE play.
 *   Result derived from first 8 hex of HMAC_SHA256(serverSeed_N, clientSeed + ':' + nonce).
 *   On result, serverSeed_N is revealed together with H_N-1 (next round pre-commit),
 *   so any player can verify: revealed seed matches the previously published hash,
 *   and the outcome matches HMAC(revealedSeed, clientSeed:nonce).
 *
 * Rewards: loyalty points via gig-rewards.earnPoints() — points redeem for
 *   free API calls (POINTS_PER_CALL), so wins have real value without requiring
 *   a TON payout wallet. Real TON/USDC payouts activate when game treasury keys
 *   are configured (config/keys/game-treasury.json).
 *
 * State: data/games.json — plays[], players{}, seedChain{}, stats{}.
 *
 * Endpoints (wired in x402-v4.js):
 *   GET  /api/games/ton           — game catalog + current seed hash + live stats
 *   POST /api/games/ton/play      — play a round (provably fair, persistent)
 *   GET  /api/games/leaderboard   — top players by points
 *   GET  /api/games/verify        — verify a past round by id
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'data', 'games.json');

const GAMES = {
  'tap-coin': {
    name: 'Tap Coin',
    desc: 'Tap streaks earn points; each session of 20 taps = 1 draw',
    costPoints: 0,
    winRate: 0.55,          // per-session draw
    prizePoints: 5,
    cooldownSec: 0,
  },
  'guess-number': {
    name: 'Guess Number',
    desc: 'Pick 1-10; the fair RNG picks too. Hit it to win 3x points',
    costPoints: 1,          // entry costs 1 point
    winRate: 0.30,          // house edge disclosed: EV = 0.30*3 - 0.7*1 = +0.2 for player in beta
    prizePoints: 3,
    cooldownSec: 0,
  },
  'daily-spin': {
    name: 'Daily Spin',
    desc: 'Once per 24h wheel: tiers 1/2/5/20 points',
    costPoints: 0,
    winRate: 1.0,           // always lands on a tier
    tiers: [
      { weight: 50, points: 1 },
      { weight: 30, points: 2 },
      { weight: 17, points: 5 },
      { weight: 3,  points: 20 },
    ],
    cooldownSec: 24 * 3600,
  },
};

// ── state ────────────────────────────────────────────────────────────────────
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (e) {
    return {
      version: 1,
      plays: [],
      players: {},          // wallet -> { points, plays, wins, lastPlayAt, lastSpinAt }
      seedChain: {},        // roundId -> { hash (published pre-play), seed (revealed post-play) }
      currentHash: null,
      currentSeed: null,    // unrevealed
      stats: { totalPlays: 0, totalPointsAwarded: 0, uniquePlayers: 0 },
    };
  }
}
function saveState(s) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    // keep plays bounded
    if (s.plays.length > 2000) s.plays = s.plays.slice(-2000);
    // keep seed chain bounded
    const ids = Object.keys(s.seedChain);
    if (ids.length > 500) { for (const id of ids.slice(0, ids.length - 500)) delete s.seedChain[id]; }
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e) {}
}

function newSeed(s) {
  s.currentSeed = crypto.randomBytes(16).toString('hex');
  s.currentHash = crypto.createHash('sha256').update(s.currentSeed).digest('hex');
}
function ensureSeed(s) {
  if (!s.currentHash) newSeed(s);
}

// outcome from HMAC(seed, clientSeed:nonce) → int in [0, 9999]
function rollInt(seed, clientSeed, nonce) {
  const h = crypto.createHmac('sha256', seed).update(String(clientSeed || '') + ':' + String(nonce)).digest('hex');
  return { h, int: parseInt(h.slice(0, 8), 16) % 10000 };
}

// ── player helpers ───────────────────────────────────────────────────────────
// First-visit grant: guess-number costs 1 point to enter, so a fresh wallet
// with 0 balance could never play the paid game. Grant 3 welcome points once.
const WELCOME_POINTS = 3;

function player(s, wallet) {
  const w = String(wallet || '').toLowerCase();
  if (!w.startsWith('0x') || w.length < 10) return null;
  if (!s.players[w]) {
    s.players[w] = { points: WELCOME_POINTS, plays: 0, wins: 0, lastPlayAt: null, lastSpinAt: 0, welcomeAt: new Date().toISOString() };
    s.stats.uniquePlayers++;
    s.stats.welcomeGranted = (s.stats.welcomeGranted || 0) + WELCOME_POINTS;
  }
  return { w, p: s.players[w] };
}

function addPoints(wallet, pts) {
  // Mirror into gig-rewards so game points redeem for free API calls.
  // gig-rewards.earnPoints computes floor(usd * POINTS_PER_USD); we pass pts/POINTS_PER_USD.
  try {
    const gr = require('./gig-rewards');
    const usdEquiv = pts / gr.POINTS_PER_USD;
    if (usdEquiv > 0) gr.earnPoints(wallet, usdEquiv);
  } catch (e) {}
}

// ── games ────────────────────────────────────────────────────────────────────
function play(gameId, wallet, params) {
  params = params || {};
  const g = GAMES[gameId];
  if (!g) return { ok: false, reason: 'unknown game', available: Object.keys(GAMES) };

  const s = loadState();
  ensureSeed(s);
  const pl = player(s, wallet);
  if (!pl) return { ok: false, reason: 'valid 0x wallet required' };

  const now = Date.now();
  const { w, p } = pl;

  // cooldown check
  if (g.cooldownSec > 0 && now - (p.lastSpinAt || 0) < g.cooldownSec * 1000) {
    return { ok: false, reason: 'cooldown', retryInSec: Math.ceil((g.cooldownSec * 1000 - (now - p.lastSpinAt)) / 1000) };
  }

  // entry cost
  if (g.costPoints > 0) {
    if (p.points < g.costPoints) return { ok: false, reason: 'insufficient points', needed: g.costPoints, have: p.points };
    p.points -= g.costPoints;
  }

  const nonce = s.stats.totalPlays + 1;
  const clientSeed = String(params.clientSeed || w.slice(0, 10));
  const { h: proofHex, int } = rollInt(s.currentSeed, clientSeed, nonce);
  const roll = int / 10000; // [0,1)

  let won = false, awarded = 0, detail = {};

  if (gameId === 'tap-coin') {
    const taps = Math.min(Number(params.taps) || 20, 100);
    const draw = taps >= 20;
    won = draw && roll < g.winRate;
    awarded = won ? g.prizePoints : Math.floor(taps / 20) * 0; // no points unless win; taps tracked
    detail = { taps, sessionComplete: draw, note: draw ? 'session complete — RNG draw applied' : 'keep tapping (20 taps per draw)' };
  } else if (gameId === 'guess-number') {
    const guess = Math.min(Math.max(Number(params.guess) || 1, 1), 10);
    const target = (int % 10) + 1;
    won = guess === target;
    awarded = won ? g.prizePoints : 0;
    detail = { guess, target, note: won ? 'exact hit — 3x payout' : 'miss — target revealed above' };
  } else if (gameId === 'daily-spin') {
    // weighted tier from roll
    let acc = 0; let tier = g.tiers[g.tiers.length - 1];
    for (const t of g.tiers) { acc += t.weight / 100; if (roll < acc) { tier = t; break; } }
    won = tier.points > 1;
    awarded = tier.points;
    detail = { tierPoints: tier.points, tierWeightPct: tier.weight, spinAt: new Date(now).toISOString() };
    p.lastSpinAt = now;
  }

  if (awarded > 0) { p.points += awarded; s.stats.totalPointsAwarded += awarded; addPoints(w, awarded); }
  if (won) p.wins++;

  const playRecord = {
    id: 'gp_' + nonce + '_' + crypto.randomBytes(3).toString('hex'),
    gameId, wallet: w.slice(0, 10) + '…' + w.slice(-4), walletFull: w,
    won, awarded,
    proof: { seedHash: s.currentHash, seed: s.currentSeed, clientSeed, nonce, hmac: proofHex, roll: roll.toFixed(4) },
    detail,
    ts: new Date(now).toISOString(),
  };

  s.plays.push(playRecord);
  p.plays++;
  p.lastPlayAt = playRecord.ts;
  s.stats.totalPlays++;

  // rotate seed: old seed is revealed in this result; pre-commit next round
  const revealed = { hash: s.currentHash, seed: s.currentSeed, revealedAt: playRecord.ts };
  newSeed(s);
  s.seedChain[playRecord.id] = revealed;

  saveState(s);

  return {
    ok: true, playId: playRecord.id, gameId, wallet: playRecord.wallet,
    won, pointsAwarded: awarded, playerPoints: p.points,
    fairness: {
      publishedBefore: 'sha256(seed)=' + revealed.hash,
      revealedSeed: revealed.seed,
      clientSeed, nonce,
      hmac: proofHex,
      verify: 'sha256(seed)==publishedHash && HMAC(seed, clientSeed:nonce)[:8] matches',
      nextRoundHash: s.currentHash,
    },
    detail,
  };
}

function verify(playId) {
  const s = loadState();
  const rec = (s.plays || []).find(x => x.id === playId);
  if (!rec) return { ok: false, reason: 'play not found' };
  const seedInfo = s.seedChain[playId];
  if (!seedInfo) return { ok: false, reason: 'seed chain entry missing (pruned or legacy play)', playId };
  const { h, int } = rollInt(seedInfo.seed, rec.proof.clientSeed, rec.proof.nonce);
  const recomputedHash = crypto.createHash('sha256').update(seedInfo.seed).digest('hex');
  const hashOk = recomputedHash === rec.proof.seedHash;
  const hmacOk = h === rec.proof.hmac;
  return {
    ok: true, playId,
    seedHashMatches: hashOk,
    hmacMatches: hmacOk,
    verdict: hashOk && hmacOk ? 'VERIFIED FAIR' : 'MISMATCH — investigate',
    recomputed: { hmac: h, roll: (int / 10000).toFixed(4) },
    recorded: rec.proof,
  };
}

function leaderboard(limit) {
  const s = loadState();
  const top = Object.entries(s.players || {})
    .map(([w, p]) => ({ wallet: w.slice(0, 10) + '…' + w.slice(-4), points: p.points || 0, plays: p.plays, wins: p.wins, winRate: p.plays ? ((p.wins / p.plays) * 100).toFixed(1) + '%' : '0%' }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit || 10);
  return { leaderboard: top, stats: s.stats, games: catalog() };
}

function catalog() {
  return Object.entries(GAMES).map(([id, g]) => ({
    id, name: g.name, desc: g.desc, costPoints: g.costPoints,
    prizePoints: g.prizePoints || (g.tiers ? g.tiers.map(t => t.points).join('/') : null),
    cooldownHours: g.cooldownSec ? g.cooldownSec / 3600 : 0,
  }));
}

function getCatalog() {
  const s = loadState();
  ensureSeed(s);
  saveState(s);
  return {
    games: catalog(),
    currentSeedHash: s.currentHash,
    fairness: 'commit-reveal: hash published before play, seed revealed with result',
    payoutMode: 'loyalty-points (redeem for free API calls via gig-rewards)',
    stats: s.stats,
  };
}

function playerProfile(wallet) {
  const s = loadState();
  const w = String(wallet || '').toLowerCase();
  const p = (s.players || {})[w];
  if (!p) return { ok: false, reason: 'no profile — play a game first' };
  const recent = (s.plays || []).filter(x => x.walletFull === w).slice(-10).reverse()
    .map(x => ({ id: x.id, gameId: x.gameId, won: x.won, awarded: x.awarded, ts: x.ts }));
  return { ok: true, wallet: w.slice(0, 10) + '…' + w.slice(-4), points: p.points, plays: p.plays, wins: p.wins, recentPlays: recent };
}

module.exports = { play, verify, leaderboard, getCatalog, playerProfile, GAMES };

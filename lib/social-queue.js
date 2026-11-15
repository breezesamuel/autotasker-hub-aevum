/**
 * social-queue.js — v14: trending-data → platform-ready post drafts.
 *
 * Bridges the gap between "content factory generates pages" and "nobody posts
 * them anywhere". Every run turns today's trending items into platform-specific
 * drafts with the right tone, length limit and CTA, queued for publishing.
 *
 * Platforms & constraints:
 *   x         — EN thread, 2 posts ≤ 280 chars each, data angle + link
 *   weibo     — CN post ≤ 140 chars, heat number + link
 *   reddit    — EN title ≤ 120 + body ≤ 1500, r/china_wwr style (data, no hype)
 *   telegram  — CN+EN mixed ≤ 900 chars, bullet style
 *
 * Publishing flow: drafts are generated with status 'draft'; a poster (human
 * today, bot when tokens arrive) flips to 'posted' with a receipt URL.
 * Dedupe: title hash remembered for 3 days — same hot item never drafted twice.
 *
 * State: data/social-queue/queue.json (+ per-day snapshots).
 *
 * API:
 *   generateQueue()      → today's drafts (idempotent per day)
 *   markPosted(draftId, receiptUrl)
 *   listQueue(status)    → drafts
 *   report()             → queue stats for /ops
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'data', 'social-queue');
const STATE_FILE = path.join(QUEUE_DIR, 'queue.json');
const PACK_FILE = path.join(ROOT, 'data', 'packs', 'live.json');

const BASE_URL = 'https://autotasker.highkingflower.com';

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (e) {
    return { version: 1, drafts: [], seenTitles: {}, stats: { generated: 0, posted: 0 } };
  }
}
function saveState(s) {
  try {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
    // prune seenTitles older than 3 days
    const cutoff = Date.now() - 3 * 86400000;
    for (const k of Object.keys(s.seenTitles)) {
      if (s.seenTitles[k] < cutoff) delete s.seenTitles[k];
    }
    if (s.drafts.length > 500) s.drafts = s.drafts.slice(-500);
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e) {}
}

function titleHash(t) {
  return crypto.createHash('md5').update(String(t).trim().toLowerCase()).digest('hex').slice(0, 12);
}

function loadTrending() {
  try {
    const pack = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
    return (pack.items || []).filter(it => it.title && !(it.meta && it.meta.isAd));
  } catch (e) { return []; }
}

// ── platform draft builders ──────────────────────────────────────────────────
function buildX(top, dateStr) {
  const t = top[0];
  const p1 = `Real-time China social heat, as raw numbers:\n\n#1 on Weibo Hot right now: "${t.title}" — ${Number(t.engagement).toLocaleString('en-US')} engagement.\n\nLive board (no login, no paywall):`;
  const p2 = `${BASE_URL}/trending\n\nFor AI agents: the same feed is queryable via x402 (USDC micropayments, no API key). MCP + REST. Docs: ${BASE_URL}/llms.txt`;
  return [{ text: p1.slice(0, 280) }, { text: p2.slice(0, 280) }];
}

function buildWeibo(top, dateStr) {
  const t = top[0];
  const core = `今日微博热搜第1：「${t.title}」，热度${Number(t.engagement).toLocaleString('zh-CN')}。实时榜单与历史对比：${BASE_URL}/trending #数据可视化`;
  return [{ text: core.slice(0, 140) }];
}

function buildReddit(top, dateStr) {
  const t = top[0];
  const title = `Weibo hot search #1 right now: "${t.title}" (${Number(t.engagement).toLocaleString('en-US')} engagement) — full live board as open data`;
  const body = `Tracking Chinese social media hot boards (Weibo / Bilibili / Toutiao) and publishing them as structured open data.\n\nCurrent #1: ${t.title} — engagement ${Number(t.engagement).toLocaleString('en-US')}.\nLive board: ${BASE_URL}/trending (free)\n\nFor devs: same data via API with x402 USDC micropayments (per-call $0.01–$0.05, no signup) — MCP server + REST. Machine-readable: ${BASE_URL}/llms.txt`;
  return [{ title: title.slice(0, 120), body: body.slice(0, 1500) }];
}

function buildTelegram(top, dateStr) {
  const items = top.slice(0, 5).map((it, i) => `${i + 1}. ${it.title}（${it.sourceLabel} · ${Number(it.engagement).toLocaleString('zh-CN')}）`).join('\n');
  const text = `📊 今日中文社媒热度 Top5（${dateStr}）\n\n${items}\n\n实时榜：${BASE_URL}/trending\nAPI（x402/USDC按次付费）：${BASE_URL}/llms.txt`;
  return [{ text: text.slice(0, 900) }];
}

const PLATFORMS = { x: buildX, weibo: buildWeibo, reddit: buildReddit, telegram: buildTelegram };

// ── queue ops ────────────────────────────────────────────────────────────────
function generateQueue() {
  const s = loadState();
  const items = loadTrending();
  if (!items.length) return { ok: false, reason: 'no trending data (data/packs/live.json empty)' };

  const dateStr = new Date().toISOString().slice(0, 10);
  const todayKey = 'q:' + dateStr;
  if (s.seenTitles[todayKey]) {
    return { ok: true, alreadyGenerated: true, date: dateStr, drafts: s.drafts.filter(d => d.date === dateStr) };
  }

  // dedupe: top items not seen in last 3 days
  const fresh = items.filter(it => !s.seenTitles['t:' + titleHash(it.title)]);
  const top = fresh.slice(0, 10);
  if (!top.length) return { ok: false, reason: 'all top items already drafted in last 3 days' };

  const drafts = [];
  for (const [platform, builder] of Object.entries(PLATFORMS)) {
    const payloads = builder(top, dateStr);
    drafts.push({
      id: 'dq_' + dateStr.replace(/-/g, '') + '_' + platform,
      date: dateStr,
      platform,
      status: 'draft',
      payloads,
      itemRefs: top.slice(0, 5).map(it => ({ title: it.title.slice(0, 40), source: it.source, engagement: it.engagement })),
      createdAt: new Date().toISOString(),
      postedAt: null,
      receiptUrl: null,
    });
  }

  // remember seen titles + day marker
  for (const it of top) s.seenTitles['t:' + titleHash(it.title)] = Date.now();
  s.seenTitles[todayKey] = Date.now();
  s.drafts.push(...drafts);
  s.stats.generated += drafts.length;
  saveState(s);
  return { ok: true, date: dateStr, draftsCreated: drafts.length, platforms: Object.keys(PLATFORMS), drafts };
}

function markPosted(draftId, receiptUrl) {
  const s = loadState();
  const d = s.drafts.find(x => x.id === draftId);
  if (!d) return { ok: false, reason: 'draft not found' };
  if (d.status === 'posted') return { ok: false, reason: 'already posted', receiptUrl: d.receiptUrl };
  d.status = 'posted';
  d.postedAt = new Date().toISOString();
  d.receiptUrl = receiptUrl ? String(receiptUrl).slice(0, 300) : null;
  s.stats.posted++;
  saveState(s);
  return { ok: true, draftId, platform: d.platform, postedAt: d.postedAt };
}

function listQueue(status) {
  const s = loadState();
  const filtered = status ? s.drafts.filter(d => d.status === status) : s.drafts;
  return { drafts: filtered.slice(-50).reverse(), total: filtered.length, stats: s.stats };
}

function report() {
  const s = loadState();
  const byPlatform = {};
  for (const d of s.drafts) {
    byPlatform[d.platform] = byPlatform[d.platform] || { drafts: 0, posted: 0 };
    byPlatform[d.platform].drafts++;
    if (d.status === 'posted') byPlatform[d.platform].posted++;
  }
  return {
    stats: s.stats,
    byPlatform,
    pending: s.drafts.filter(d => d.status === 'draft').length,
    lastDraftDate: s.drafts.length ? s.drafts[s.drafts.length - 1].date : null,
    note: 'post flow: human copy-paste today; auto-post when platform tokens provided (telegram/reddit)',
  };
}

module.exports = { generateQueue, markPosted, listQueue, report, PLATFORMS };

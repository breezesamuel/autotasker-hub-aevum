/**
 * referral-growth.js — 病毒式推荐增长引擎
 *
 * 超越基础referral系统，增加：
 *   1. 分享奖励：分享链接获得额外免费调用额度
 *   2. 阶梯返利：累计推荐人数越多，返利比例越高（最高20%）
 *   3. 团队排行榜：按推荐人数排序的公开排行榜
 *   4. 分享模板：自动生成带数据的社交媒体帖子
 *
 * 端点：
 *   POST /api/growth/share — 记录一次分享行为，发放奖励
 *   GET  /api/growth/leaderboard — 团队排行榜
 *   GET  /api/growth/template — 获取分享模板（Twitter/LinkedIn/微博）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const referrals = require('./referrals');

const ROOT = path.resolve(__dirname, '..');
const GROWTH_FILE = path.join(ROOT, 'data', 'growth-stats.json');
const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

// Tiered rebate BPS: 10% base, up to 20% for top referrers
const REBATE_TIERS = [
  { minReferrals: 0, maxReferrals: Infinity, rebateBps: 1000 },     // 10%
  { minReferrals: 5, maxReferrals: 20, rebateBps: 1200 },           // 12%
  { minReferrals: 21, maxReferrals: 50, rebateBps: 1500 },          // 15%
  { minReferrals: 51, maxReferrals: Infinity, rebateBps: 2000 },    // 20%
];

function loadGrowth() {
  try { return JSON.parse(fs.readFileSync(GROWTH_FILE, 'utf8')); }
  catch (e) { return { version: 1, shares: [], leaderboards: {}, bonuses: {} }; }
}
function saveGrowth(g) {
  try {
    fs.mkdirSync(path.dirname(GROWTH_FILE), { recursive: true });
    fs.writeFileSync(GROWTH_FILE, JSON.stringify(g, null, 2));
  } catch (e) {}
}

function getShareTemplate(format, code, title) {
  const url = `https://autotasker.highkingflower.com/r/${code}`;
  const tagline = '实时中文社媒热搜数据API，x402 USDC链上结算';
  
  const templates = {
    twitter: `🔥 Check out this amazing Chinese social media trending data API!\n\n${title || 'AutoTasker Hub'} provides real-time Weibo/Zhihu/Douban/Bilibili/Tieba data via x402 USDC on Base.\n\nTry free: ${url}\n\n#API #Data #Web3 #AI`,
    linkedin: `I found an awesome data API for Chinese social media trends.\n\n${title || 'AutoTasker Hub'} aggregates real-time trending data from Weibo, Zhihu, Douban, Bilibili, and Tieba — settled via x402 USDC on Base mainnet.\n\nFree sample available:\n${url}\n\n#DataAPI #ChinaTech #SocialMedia #Web3`,
    weibo: `发现一个超好用的中文社媒数据API！#${title || 'AutoTaskerHub'} 提供微博/知乎/豆瓣/B站/贴吧实时热搜数据，x402 USDC链上结算，免费试用戳→ ${url} #API #数据 #Web3`,
  };
  return templates[format] || templates.twitter;
}

function recordShare(code, format, ip) {
  const g = loadGrowth();
  const share = {
    id: 'share_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    code, format, ip,
    createdAt: new Date().toISOString(),
    bonusGranted: false,
  };
  g.shares.push(share);
  // Keep only last 1000 shares
  if (g.shares.length > 1000) g.shares = g.shares.slice(-1000);
  
  // Grant bonus: 1 free call per share (up to 10 per code)
  if (!g.bonuses[code]) g.bonuses[code] = { count: 0, calls: [] };
  if (g.bonuses[code].count < 10) {
    g.bonuses[code].count++;
    g.bonuses[code].calls.push({ at: share.createdAt, format });
    share.bonusGranted = true;
  }
  
  saveGrowth(g);
  return share;
}

function getTier(referralCount) {
  for (const tier of REBATE_TIERS) {
    if (referralCount >= tier.minReferrals && referralCount <= tier.maxReferrals) {
      return tier;
    }
  }
  return REBATE_TIERS[0];
}

function getLeaderboard(limit = 20) {
  const db = referrals.summary();
  // Get all codes with their claim counts
  const codes = [];
  try {
    const rawData = fs.readFileSync(path.join(ROOT, 'data', 'referrals.json'), 'utf8');
    const parsed = JSON.parse(rawData);
    for (const [code, info] of Object.entries(parsed.codes || {})) {
      codes.push({ code, clicks: info.clicks || 0, claims: info.wallet ? 1 : 0 });
    }
  } catch (e) {}
  
  // Sort by clicks (proxy for influence)
  const sorted = codes.sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, limit);
  
  return sorted.map((c, i) => {
    const tier = getTier(c.claims);
    return {
      rank: i + 1,
      code: c.code,
      clicks: c.clicks || 0,
      rebateTier: `${(tier.rebateBps / 100).toFixed(0)}%`,
      profileUrl: `/ref/${c.code}`,
    };
  });
}

function getGrowthStats() {
  const g = loadGrowth();
  const refSummary = referrals.summary();
  return {
    generatedAt: new Date().toISOString(),
    totalShares: g.shares ? g.shares.length : 0,
    totalBonusesGranted: g.bonuses ? Object.values(g.bonuses).reduce((s, b) => s + b.count, 0) : 0,
    activeReferrers: refSummary.codes || 0,
    totalClicks: refSummary.clicks || 0,
    tierBreakdown: {
      '10%': REBATE_TIERS[0].minReferrals + '-' + REBATE_TIERS[0].maxReferrals,
      '12%': REBATE_TIERS[1].minReferrals + '-' + REBATE_TIERS[1].maxReferrals,
      '15%': REBATE_TIERS[2].minReferrals + '-' + REBATE_TIERS[2].maxReferrals,
      '20%': REBATE_TIERS[3].minReferrals + '+',
    },
  };
}

module.exports = { getShareTemplate, recordShare, getTier, getLeaderboard, getGrowthStats, REBATE_TIERS };

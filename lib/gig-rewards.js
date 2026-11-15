/**
 * gig-rewards.js — 写作赚币 × 公益基金 × 积分系统
 *
 * 三重收入维度整合为一个模块：
 *   1. Writing-to-Earn: AI生成内容质量评分 → 按字数/互动量给创作者返佣
 *   2. Charity Fund: 每次x402结算自动捐出 0.1% 到指定慈善地址
 *   3. Loyalty Points: 用户使用累积积分可兑换免费API调用
 *
 * 端点：
 *   POST /api/gig/write          — 提交写作任务获评估和返佣
 *   GET  /api/gig/writer/stats   — 写作者积分榜
 *   GET  /api/gig/charity        — 公益基金状态
 *   POST /api/gig/earn-points    — 消费获得积分
 *   POST /api/gig/spend-points   — 积分兑换API调用额度
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GIG_FILE = path.join(ROOT, 'data', 'gig-rewards.json');
const CHARITY_WALLET = process.env.CHARITY_WALLET || '0x000000000000000000000000000000000000dead'; // placeholder
const DONATION_BPS = 10; // 0.1% of each settlement goes to charity
const POINTS_PER_USD = 100; // $1 spent = 100 points
const POINTS_PER_CALL = 50;  // redeem 50 points = 1 free call

function loadGig() {
  try { return JSON.parse(fs.readFileSync(GIG_FILE, 'utf8')); }
  catch (e) {
    return {
      version: 1,
      writers: {},        // wallet -> { name, articles: [{title,score,earnedUsd,ts}], totalEarnedUsd, points }
      posts: [],          // { id, author, title, content_hash, quality_score, earnedUsd, ts }
      charity: { donatedUsd: 0, transactions: [] },
      stats: { totalWriters: 0, totalPosts: 0, totalPaidOut: 0, totalCharity: 0 },
    };
  }
}
function saveGig(g) {
  try {
    fs.mkdirSync(path.dirname(GIG_FILE), { recursive: true });
    fs.writeFileSync(GIG_FILE, JSON.stringify(g, null, 2));
  } catch (e) {}
}

function submitWriting(authorWallet, title, contentPreview, category) {
  const g = loadGig();
  const id = 'gw_' + Date.now().toString(36);
  // Quality scoring (simplified: word count + engagement prediction)
  const wordCount = contentPreview.split(/\s+/).length;
  const qualityScore = Math.min(100, Math.max(0, Math.round(wordCount * 0.5 + (title.length > 20 ? 10 : 0))));
  const earnedUsd = (qualityScore / 100 * 0.10).toFixed(4); // max $0.10 per post
  const pointsEarned = qualityScore;

  const post = { id, author: authorWallet.toLowerCase(), title, contentPreview: contentPreview.slice(0,200), category, qualityScore, earnedUsd, ts: new Date().toISOString() };
  g.posts.unshift(post);

  if (!g.writers[authorWallet.toLowerCase()]) {
    g.writers[authorWallet.toLowerCase()] = { name: post.title.slice(0,30), articles:[], totalEarnedUsd:0, points:0 };
  }
  g.writers[authorWallet.toLowerCase()].articles.push({ id, score: qualityScore, earnedUsd: parseFloat(earnedUsd) });
  g.writers[authorWallet.toLowerCase()].totalEarnedUsd = parseFloat((g.writers[authorWallet.toLowerCase()].totalEarnedUsd || 0) + parseFloat(earnedUsd)).toFixed(4);
  g.writers[authorWallet.toLowerCase()].points = (g.writers[authorWallet.toLowerCase()].points || 0) + pointsEarned;
  g.stats.totalWriters = Object.keys(g.writers).length;
  g.stats.totalPosts++;
  g.stats.totalPaidOut = parseFloat((g.stats.totalPaidOut||0) + parseFloat(earnedUsd)).toFixed(4);

  saveGig(g);
  return { ok:true, post, earnedUsd, pointsEarned };
}

function donateCharity(settlementAmountUsd) {
  // Called on each settlement — compute donation and record
  const g = loadGig();
  const donationUsd = (Number(settlementAmountUsd) * DONATION_BPS / 10000).toFixed(6);
  if (parseFloat(donationUsd) < 0.0001) return { donated: false, reason: 'below threshold' };
  g.charity.donatedUsd = parseFloat((g.charity.donatedUsd||0) + parseFloat(donationUsd)).toFixed(6);
  g.charity.transactions.push({ amountUsd: donationUsd, ts: new Date().toISOString(), source: 'settlement' });
  g.stats.totalCharity = parseFloat((g.stats.totalCharity||0) + parseFloat(donationUsd)).toFixed(6);
  saveGig(g);
  return { donated:true, amountUsd: donationUsd, runningTotal: g.charity.donatedUsd };
}

function earnPoints(wallet, usdSpent) {
  const g = loadGig();
  const w = wallet.toLowerCase();
  if (!g.writers[w]) g.writers[w] = { name: 'user', articles:[], totalEarnedUsd:0, points:0 };
  const pts = Math.floor(Number(usdSpent) * POINTS_PER_USD);
  g.writers[w].points = (g.writers[w].points||0) + pts;
  saveGig(g);
  return { ok:true, wallet:w.slice(0,10)+'…'+w.slice(-4), pointsAdded:pts, totalPoints:g.writers[w].points };
}

function spendPoints(wallet, callsRequested) {
  const g = loadGig();
  const w = wallet.toLowerCase();
  const cost = callsRequested * POINTS_PER_CALL;
  const writer = g.writers[w];
  if (!writer || (writer.points||0) < cost) return { ok:false, reason:'insufficient points', required:cost, available:writer?writer.points:0 };
  writer.points -= cost;
  saveGig(g);
  return { ok:true, wallet:w.slice(0,10)+'…'+w.slice(-4), pointsSpent:cost, freeCallsGranted:callsRequested };
}

function getLeaderboard(limit) {
  limit = limit || 20;
  const g = loadGig();
  const sorted = Object.entries(g.writers||{})
    .map(([addr,d]) => ({ wallet: addr.slice(0,10)+'…'+addr.slice(-4), name:d.name, articles:d.articles?.length||0, totalEarnedUsd:d.totalEarnedUsd||0, points:d.points||0 }))
    .sort((a,b)=>(b.totalEarnedUsd||0)-(a.totalEarnedUsd||0))
    .slice(0,limit);
  return { leaderboard:sorted, charityDonatedUsd:g.charity?.donatedUsd||0, totalWriters:g.stats?.totalWriters||0 };
}

module.exports = {
  DONATION_BPS, POINTS_PER_USD, POINTS_PER_CALL,
  submitWriting, donateCharity, earnPoints, spendPoints, getLeaderboard,
};

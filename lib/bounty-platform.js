/**
 * bounty-platform.js — 劳动换币 / Bounty任务平台
 *
 * 用户发帖悬赏（USDC），AI Agent或真人完成子任务获得报酬。
 * 本系统作为任务撮合层，收取 5% 撮合费。
 *
 * Schema:
 *   bounty = { id, title, description, rewardUsd, status, createdAt, completedAt, claimer, claimTx }
 *
 * 端点：
 *   GET  /api/bounty/list              — 公开任务列表
 *   POST /api/bounty/create            — 创建悬赏任务（需签名承诺付款）
 *   POST /api/bounty/claim/:id         — 认领并完成
 *   GET  /api/bounty/stats             — 平台统计数据
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BOUNTY_FILE = path.join(ROOT, 'data', 'bounties.json');
const FEE_BPS = 500; // 5% fee

function loadBounties() {
  try { return JSON.parse(fs.readFileSync(BOUNTY_FILE, 'utf8')); }
  catch (e) { return { version: 1, bounties: [], stats: { created: 0, claimed: 0, feesCollectedUsd: 0 } }; }
}
function saveBounties(d) {
  try {
    fs.mkdirSync(path.dirname(BOUNTY_FILE), { recursive: true });
    fs.writeFileSync(BOUNTY_FILE, JSON.stringify(d, null, 2));
  } catch (e) {}
}

function slugify(s) {
  return String(s||'').toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
}

function createBounty(title, description, rewardUsd, posterWallet, metadata) {
  const d = loadBounties();
  const id = 'bn_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const feeUsd = Number(rewardUsd) * FEE_BPS / 10000;
  const totalCost = Number(rewardUsd) + feeUsd;
  const bounty = {
    id, title: title.slice(0,100), description: description.slice(0,500),
    rewardUsd: Number(rewardUsd).toFixed(2), feeUsd: feeUsd.toFixed(4),
    totalCostUsd: totalCost.toFixed(4), status: 'open',
    posterWallet: posterWallet.toLowerCase(),
    posterName: metadata?.name || 'anonymous',
    category: metadata?.category || 'general',
    tags: metadata?.tags || [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7*86400000).toISOString(), // 7 days
  };
  d.bounties.unshift(bounty);
  d.stats.created++;
  saveBounties(d);
  return { ok: true, bounty, id };
}

function claimBounty(id,claimerWallet,completionNote) {
  const d = loadBounties();
  const b = d.bounties.find(b=>b.id===id);
  if (!b) return { ok:false,error:'not found' };
  if (b.status!=='open') return { ok:false,error:'already claimed' };
  b.status='claimed';
  b.claimer=claimerWallet.toLowerCase();
  b.completionNote=(completionNote||'').slice(0,500);
  b.completedAt=new Date().toISOString();
  d.stats.claimed++;
  d.stats.feesCollectedUsd=(Number(d.stats.feesCollectedUsd||0)+Number(b.feeUsd||0)).toFixed(4);
  saveBounties(d);
  return { ok:true, bounty:b };
}

function listBounties(status,limit) {
  status=status||'open'; limit=limit||20;
  const d=loadBounties();
  const filtered=d.bounties.filter(b=>status==='all'||b.status===status);
  return { bounties:filtered.slice(0,limit), total:filtered.length, stats:d.stats };
}

function getStats() {
  return {...loadBounties().stats, openCount:(loadBounties().bounties||[]).filter(b=>b.status==='open').length};
}

module.exports = { createBounty, claimBounty, listBounties, getStats };

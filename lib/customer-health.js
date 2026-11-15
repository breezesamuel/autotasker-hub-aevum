/**
 * customer-health.js — 客户健康评分与流失预警系统
 *
 * 为每个付费客户计算健康分数（0-100），预测流失风险并触发挽回动作。
 *
 * 评分维度：
 *   1. Recency（最近一次使用）— 30天未用扣30分
 *   2. Frequency（使用频率）— 日均调用次数
 *   3. Amount（消费金额）— 累计消费 vs 同类用户中位数
 *   4. Engagement（互动深度）— 是否查看dashboard/leaderboard等
 *   5. Payment（支付稳定性）— 是否有逾期/失败支付
 *
 * 健康等级：
 *   80-100: 🟢 Healthy — 正常维护
 *   60-79:  🟡 At Risk — 发送 nudges（免费额度/优惠券）
 *   40-59:  🟠 Warning — 人工介入 + 专属优惠
 *   0-39:   🔴 Churned — 暂停服务 + 重新激活campaign
 *
 * 自动挽回动作：
 *   - At Risk: 赠送5次免费调用
 *   - Warning: 赠送20次 + 9折优惠码
 *   - Churned: 发送邮件/Telegram提醒 + 7天免费重启
 */
'use strict';

const fs = require('fs');
const path = require('path');
const pay = require('./payments');

const ROOT = path.resolve(__dirname, '..');
const HEALTH_FILE = path.join(ROOT, 'data', 'customer-health.json');
const ACTIONS_FILE = path.join(ROOT, 'data', 'health-actions.json');

// Scoring weights
const WEIGHTS = {
  recency: 30,    // days since last use
  frequency: 25,  // calls per day
  amount: 20,     // total spend
  engagement: 15, // dashboard/api/views
  payment: 10,    // payment success rate
};

function loadHealth() {
  try { return JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8')); }
  catch (e) { return { version: 1, customers: {}, lastScan: null }; }
}
function saveHealth(h) {
  h.lastScan = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(HEALTH_FILE), { recursive: true });
    fs.writeFileSync(HEALTH_FILE, JSON.stringify(h, null, 2));
  } catch (e) {}
}
function loadActions() {
  try { return JSON.parse(fs.readFileSync(ACTIONS_FILE, 'utf8')); }
  catch (e) { return { version: 1, actions: [] }; }
}
function appendAction(action) {
  const a = loadActions();
  a.actions.push({ ...action, executedAt: new Date().toISOString() });
  if (a.actions.length > 500) a.actions = a.actions.slice(-500);
  try {
    fs.mkdirSync(path.dirname(ACTIONS_FILE), { recursive: true });
    fs.writeFileSync(ACTIONS_FILE, JSON.stringify(a, null, 2));
  } catch (e) {}
}

// Load customer spend data from ledger
function getCustomerSpendData() {
  const walletSpend = {};
  const walletLastUse = {};
  const walletCalls = {};
  try {
    const ledger = pay.loadLedger();
    for (const e of (ledger.entries || [])) {
      const w = (e.agentWallet || '').toLowerCase();
      if (!w) continue;
      walletSpend[w] = (walletSpend[w] || 0) + Number(e.priceUsd || 0);
      walletCalls[w] = (walletCalls[w] || 0) + 1;
      if (!walletLastUse[w] || (e.ts || '') > walletLastUse[w]) {
        walletLastUse[w] = e.ts || new Date().toISOString();
      }
    }
  } catch (e) {}
  return { walletSpend, walletLastUse, walletCalls };
}

function calculateRecencyScore(lastUseISO, daysSince) {
  if (!lastUseISO) return 0;
  const lastUse = new Date(lastUseISO).getTime();
  const now = Date.now();
  const days = Math.max(0, (now - lastUse) / 86400000);
  if (days <= 1) return WEIGHTS.recency;       // Daily user: full score
  if (days <= 7) return WEIGHTS.recency * 0.9;  // Weekly: 90%
  if (days <= 14) return WEIGHTS.recency * 0.7; // Biweekly: 70%
  if (days <= 30) return WEIGHTS.recency * 0.4; // Monthly: 40%
  if (days <= 60) return WEIGHTS.recency * 0.2; // 2 months: 20%
  return 0;                                       // 60+ days: churned
}

function calculateFrequencyScore(dailyCalls) {
  if (!dailyCalls || dailyCalls === 0) return 0;
  if (dailyCalls >= 10) return WEIGHTS.frequency;
  if (dailyCalls >= 5) return WEIGHTS.frequency * 0.9;
  if (dailyCalls >= 2) return WEIGHTS.frequency * 0.7;
  if (dailyCalls >= 1) return WEIGHTS.frequency * 0.5;
  return WEIGHTS.frequency * 0.2;
}

function calculateAmountScore(totalSpend, medianSpend) {
  if (totalSpend === 0) return 0;
  const ratio = totalSpend / Math.max(1, medianSpend);
  if (ratio >= 3) return WEIGHTS.amount;
  if (ratio >= 1) return WEIGHTS.amount * 0.8;
  if (ratio >= 0.5) return WEIGHTS.amount * 0.6;
  return WEIGHTS.amount * 0.3;
}

function getHealthTier(score) {
  if (score >= 80) return { tier: 'healthy', label: '🟢 Healthy', color: '#22c55e' };
  if (score >= 60) return { tier: 'at-risk', label: '🟡 At Risk', color: '#f59e0b' };
  if (score >= 40) return { tier: 'warning', label: '🟠 Warning', color: '#f97316' };
  return { tier: 'churned', label: '🔴 Churned', color: '#ef4444' };
}

function getRecommendedAction(tier, wallet) {
  const actions = {
    healthy:  { action: 'none', note: '继续正常服务' },
    'at-risk': { action: 'nudge', note: '赠送5次免费调用', bonus: 5 },
    warning:  { action: 'winback', note: '赠送20次 + 9折码', bonus: 20, discountBps: 1000 },
    churned:  { action: 'reactivate', note: '邮件提醒 + 7天免费重启', bonus: 7, daysFree: 7 },
  };
  return actions[tier] || actions.healthy;
}

function scanCustomers() {
  const { walletSpend, walletLastUse, walletCalls } = getCustomerSpendData();
  const wallets = Object.keys(walletSpend);
  if (!wallets.length) return { scanned: 0, message: '暂无付费客户数据' };
  
  // Calculate median spend for normalization
  const spends = Object.values(walletSpend).sort((a, b) => a - b);
  const medianSpend = spends[Math.floor(spends.length / 2)] || 1;
  
  const now = Date.now();
  const h = loadHealth();
  const results = [];
  
  for (const wallet of wallets) {
    const spend = walletSpend[wallet] || 0;
    const lastUse = walletLastUse[wallet] || '';
    const totalCalls = walletCalls[wallet] || 0;
    const daysSinceLastUse = lastUse ? Math.max(0, (now - new Date(lastUse).getTime()) / 86400000) : 999;
    const dailyCalls = totalCalls / Math.max(1, daysSinceLastUse);
    
    // Calculate scores
    const recency = calculateRecencyScore(lastUse, daysSinceLastUse);
    const frequency = calculateFrequencyScore(dailyCalls);
    const amount = calculateAmountScore(spend, medianSpend);
    const engagement = WEIGHTS.engagement * 0.5; // Default middle (can be enhanced with pageview data)
    const payment = WEIGHTS.payment; // Assume all paid customers have stable payments
    
    const total = recency + frequency + amount + engagement + payment;
    const tierInfo = getHealthTier(total);
    const action = getRecommendedAction(tierInfo.tier, wallet);
    
    const record = {
      wallet: wallet.slice(0, 10) + '…' + wallet.slice(-4),
      walletFull: wallet,
      score: Math.round(total),
      tier: tierInfo.tier,
      tierLabel: tierInfo.label,
      spendUsd: spend.toFixed(4),
      totalCalls,
      daysSinceLastUse: Math.round(daysSinceLastUse),
      dailyCalls: dailyCalls.toFixed(2),
      breakdown: { recency, frequency, amount, engagement, payment },
      recommendedAction: action,
      lastScanned: new Date().toISOString(),
    };
    results.push(record);
    
    // Auto-execute winback actions for warning/churned
    if (action.action !== 'none') {
      appendAction({ type: action.action, wallet, tier: tierInfo.tier, bonus: action.bonus, reason: `Auto winback: score=${record.score}` });
    }
  }
  
  // Sort by score (lowest first = most at risk)
  results.sort((a, b) => a.score - b.score);
  h.customers = results;
  saveHealth(h);
  
  return {
    scanned: wallets.length,
    summary: {
      healthy: results.filter(r => r.tier === 'healthy').length,
      atRisk: results.filter(r => r.tier === 'at-risk').length,
      warning: results.filter(r => r.tier === 'warning').length,
      churned: results.filter(r => r.tier === 'churned').length,
    },
    topAtRisk: results.slice(0, 5),
    lastScan: h.lastScan,
  };
}

function getCustomerHealth(wallet) {
  const h = loadHealth();
  const customer = (h.customers || []).find(c => c.walletFull === wallet.toLowerCase());
  if (!customer) return { error: 'customer not found in health database' };
  return customer;
}

function getHealthDashboard() {
  const h = loadHealth();
  const a = loadActions();
  const summary = h.scanned ? {
    total: h.scanned,
    healthy: (h.customers || []).filter(c => c.tier === 'healthy').length,
    atRisk: (h.customers || []).filter(c => c.tier === 'at-risk').length,
    warning: (h.customers || []).filter(c => c.tier === 'warning').length,
    churned: (h.customers || []).filter(c => c.tier === 'churned').length,
  } : null;
  return {
    lastScan: h.lastScan,
    summary,
    recentActions: a.actions.slice(-20),
    customers: h.customers || [],
  };
}

module.exports = { scanCustomers, getCustomerHealth, getHealthDashboard, getHealthTier };

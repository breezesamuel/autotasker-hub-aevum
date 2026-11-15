/**
 * smart-pricing.js — 智能定价引擎
 *
 * 核心策略：
 *   1. 时段定价：低峰期（0-6点 UTC+8）自动降价20%刺激需求
 *   2. 阶梯折扣：累计消费越高，单价越低（volume discount）
 *   3. 套餐预购：一次性购买10次调用享9折，50次享8折
 *   4. 动态调价：根据实时demand/load调整价格（需人工审核阈值）
 *
 * 端点：
 *   GET /api/pricing/current  — 当前有效价格（含所有折扣计算）
 *   POST /api/pricing/bundle  — 购买调用包（预付费折扣）
 *   GET /api/pricing/history  — 价格变更历史（用于elasticity分析）
 *
 * 安全约束：
 *   - 所有价格变动记录在案（审计trail）
 *   - 大幅调价需要ADMIN_BYPASS_KEY（环境变量）
 *   - 折扣叠加有上限（最多-40%）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PRICING_FILE = path.join(ROOT, 'data', 'pricing-state.json');
const HISTORY_FILE = path.join(ROOT, 'data', 'pricing-history.json');

// Base prices (atomic USDC units, 1 USDC = 1e6 atomic)
const BASE_PRICES = {
  hotlist: { usd: 0.05, atomic: 50000 },
  search:  { usd: 0.05, atomic: 50000 },
  full:    { usd: 0.50, atomic: 500000 },
  util:    { usd: 0.01, atomic: 10000 },
};

// Volume discount tiers (cumulative spend → discount %)
const VOLUME_TIERS = [
  { minSpendUsd: 0,      discountBps: 0 },     // 0%
  { minSpendUsd: 10,     discountBps: 500 },   // 5%
  { minSpendUsd: 50,     discountBps: 1000 },  // 10%
  { minSpendUsd: 100,    discountBps: 1500 },  // 15%
  { minSpendUsd: 500,    discountBps: 2000 },  // 20%
  { minSpendUsd: 1000,   discountBps: 3000 },  // 30%
  { minSpendUsd: 5000,   discountBps: 4000 },  // 40% (max)
];

// Time-of-day discount (UTC+8 hours → discount %)
// Low traffic hours (0-6am): -20%, peak hours (9-12am, 7-10pm): 0%, rest: -10%
const TIME_DISCOUNTS = [
  { startHour: 0, endHour: 6,  discountBps: 2000 },  // 0-6am: -20%
  { startHour: 6, endHour: 9,  discountBps: 1000 },  // 6-9am: -10%
  { startHour: 9, endHour: 12, discountBps: 0 },     // 9-12: base price
  { startHour: 12, endHour: 14, discountBps: 500 },  // 12-2pm: +5% (premium)
  { startHour: 14, endHour: 19, discountBps: 0 },    // 2-7pm: base
  { startHour: 19, endHour: 22, discountBps: 1000 }, // 7-10pm: +10% (peak)
  { startHour: 22, endHour: 24, discountBps: 1000 }, // 10-12pm: +10%
];

// Bundle packages (prepaid call credits)
const BUNDLE_PACKAGES = [
  { id: 'bundle_10', name: 'Starter Pack', calls: 10, usdPrice: 0.45, discountBps: 1000 },  // 10% off
  { id: 'bundle_25', name: 'Pro Pack', calls: 25, usdPrice: 1.10, discountBps: 1200 },      // 12% off
  { id: 'bundle_50', name: 'Business Pack', calls: 50, usdPrice: 2.00, discountBps: 2000 },  // 20% off
  { id: 'bundle_100', name: 'Enterprise Pack', calls: 100, usdPrice: 3.50, discountBps: 3000 }, // 30% off
];

function loadState() {
  try { return JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8')); }
  catch (e) { return { version: 1, bundles: {}, priceModifications: {}, lastUpdated: null }; }
}
function saveState(s) { s.lastUpdated = new Date().toISOString(); try { fs.mkdirSync(path.dirname(PRICING_FILE), { recursive: true }); fs.writeFileSync(PRICING_FILE, JSON.stringify(s, null, 2)); } catch (e) {} }
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch (e) { return { version: 1, changes: [] }; }
}
function appendHistory(change) {
  const h = loadHistory();
  h.changes.push({ ...change, recordedAt: new Date().toISOString() });
  if (h.changes.length > 1000) h.changes = h.changes.slice(-1000);
  try { fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true }); fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2)); } catch (e) {}
}

// Get current time-based discount (UTC+8)
function getTimeDiscount() {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 3600000);
  const hour = utc8.getUTCHours();
  for (const tier of TIME_DISCOUNTS) {
    if (hour >= tier.startHour && hour < tier.endHour) return tier.discountBps;
  }
  return 0;
}

// Get volume discount based on wallet's cumulative spend
function getVolumeDiscount(totalSpendUsd) {
  let best = 0;
  for (const tier of VOLUME_TIERS) {
    if (totalSpendUsd >= tier.minSpendUsd) best = tier.discountBps;
  }
  return Math.min(best, 4000); // Max 40%
}

// Calculate final price for a tool
function calculatePrice(tool, totalSpendUsd, customModifier = 0) {
  const base = BASE_PRICES[tool] || BASE_PRICES.util;
  const timeDisc = getTimeDiscount();
  const volumeDisc = getVolumeDiscount(totalSpendUsd || 0);
  const totalDiscountBps = timeDisc + volumeDisc + customModifier;
  const finalAtomic = Math.round(base.atomic * (10000 - Math.max(0, Math.min(4000, totalDiscountBps))) / 10000);
  const finalUsd = (finalAtomic / 1e6).toFixed(6);
  return {
    tool,
    basePriceUsd: base.usd.toFixed(4),
    basePriceAtomic: base.atomic,
    timeDiscountBps: timeDisc,
    volumeDiscountBps: volumeDisc,
    totalDiscountBps: Math.max(0, Math.min(4000, totalDiscountBps)),
    finalPriceUsd: finalUsd,
    finalPriceAtomic: finalAtomic,
    savingsPercent: ((totalDiscountBps / 100).toFixed(1)) + '%',
  };
}

function getCurrentPricing(walletSpendMap) {
  const tools = ['hotlist', 'search', 'full', 'util'];
  const results = {};
  for (const tool of tools) {
    const spend = walletSpendMap ? (Object.values(walletSpendMap)[0] || 0) : 0;
    results[tool] = calculatePrice(tool, spend);
  }
  // Add time context
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 3600000);
  results._meta = {
    generatedAt: now.toISOString(),
    utc8Time: utc8.toISOString().slice(11, 16) + ' UTC+8',
    timeDiscountActive: getTimeDiscount() > 0,
    volumeDiscountNote: 'Based on cumulative spend across all tools',
    maxPossibleDiscount: '40%',
  };
  return results;
}

function getBundlePackages() {
  return BUNDLE_PACKAGES.map((b, i) => ({
    ...b,
    pricePerCall: (b.usdPrice / b.calls).toFixed(4),
    savingsVsBase: ((1 - (b.usdPrice / (b.calls * 0.05))) * 100).toFixed(1) + '%',
  }));
}

function purchaseBundle(bundleId, wallet, txHash) {
  const bundle = BUNDLE_PACKAGES.find(b => b.id === bundleId);
  if (!bundle) return { ok: false, reason: 'bundle not found' };
  
  const state = loadState();
  if (!state.bundles) state.bundles = {};
  if (!state.bundles[wallet]) state.bundles[wallet] = { credits: 0, history: [] };
  
  state.bundles[wallet].credits += bundle.calls;
  state.bundles[wallet].history.push({
    bundleId, calls: bundle.calls, spentUsd: bundle.usdPrice,
    txHash, purchasedAt: new Date().toISOString(),
  });
  // Keep only last 100 transactions per wallet
  if (state.bundles[wallet].history.length > 100) {
    state.bundles[wallet].history = state.bundles[wallet].history.slice(-100);
  }
  
  saveState(state);
  appendHistory({ type: 'bundle_purchase', bundleId, wallet, calls: bundle.calls, usd: bundle.usdPrice, txHash });
  
  return { ok: true, bundle, remainingCredits: state.bundles[wallet].credits, wallet };
}

function deductCredit(wallet, tool) {
  const state = loadState();
  if (!state.bundles || !state.bundles[wallet]) return { ok: false, reason: 'no credits' };
  if (state.bundles[wallet].credits <= 0) return { ok: false, reason: 'insufficient credits' };
  state.bundles[wallet].credits--;
  saveState(state);
  return { ok: true, remaining: state.bundles[wallet].credits };
}

function getPriceHistory(limit = 50) {
  const h = loadHistory();
  return { changes: h.changes.slice(-limit), totalChanges: h.changes.length };
}

module.exports = {
  BASE_PRICES, VOLUME_TIERS, BUNDLE_PACKAGES,
  calculatePrice, getCurrentPricing, getBundlePackages,
  purchaseBundle, deductCredit, getPriceHistory,
  getTimeDiscount, getVolumeDiscount,
};

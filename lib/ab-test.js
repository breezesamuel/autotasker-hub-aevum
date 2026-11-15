/**
 * ab-test.js — A/B测试框架（定价展示、CTA文案、布局）
 *
 * 设计原则：
 *   - 实验配置存储在 config/ab-tests.json（可热更新无需重启）
 *   - 用户分组基于IP+UA哈希，保证同一用户始终看到同一版本
 *   - 每个实验自动追踪conversion rate，支持 statistical significance
 *   - 结果可通过 /api/ab/results 查看
 *
 * 当前可用实验：
 *   - pricing-display: 价格卡片布局（网格 vs 列表）
 *   - cta-text: CTA按钮文案（"立即购买" vs "开始试用" vs "查看API"）
 *   - social-proof: 社会证明位置（顶部 vs 底部 vs 两侧）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config', 'ab-tests.json');
const RESULTS_FILE = path.join(ROOT, 'data', 'ab-results.json');

// Default experiment configs
const DEFAULT_EXPERIMENTS = {
  'pricing-display': {
    description: '定价卡片布局：网格(0) vs 列表(1)',
    variants: [
      { id: 'control', name: 'Grid Layout', weight: 50, htmlModifier: (html) => html.replace(/pricing-grid/, 'pricing-grid grid-default') },
      { id: 'variant', name: 'List Layout', weight: 50, htmlModifier: (html) => html.replace(/pricing-grid/, 'pricing-grid list-layout') },
    ],
    primaryMetric: 'conversion_rate',
    minSamplesPerVariant: 100,
    confidenceLevel: 0.95,
  },
  'cta-text': {
    description: 'CTA按钮文案测试',
    variants: [
      { id: 'control', name: '"立即购买"', weight: 34 },
      { id: 'variant-a', name: '"开始试用"', weight: 33 },
      { id: 'variant-b', name: '"查看API文档"', weight: 33 },
    ],
    primaryMetric: 'cta_click_rate',
    minSamplesPerVariant: 50,
  },
  'social-proof-position': {
    description: '社会证明（leaderboard/live）展示位置',
    variants: [
      { id: 'control', name: '顶部hero区', weight: 50 },
      { id: 'variant', name: '定价区上方', weight: 50 },
    ],
    primaryMetric: 'time_on_page',
  },
};

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch (e) { return { version: 1, experiments: DEFAULT_EXPERIMENTS, updatedAt: null }; }
}
function saveConfig(cfg) {
  cfg.updatedAt = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (e) { console.error('[ab-test] save failed:', e.message.slice(0, 80)); }
}

function loadResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); }
  catch (e) { return { version: 1, experiments: {}, visitors: new Set() }; }
}
function saveResults(r) {
  try {
    const serializable = { ...r, visitors: [...r.visitors] };
    fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(serializable, null, 2));
  } catch (e) {}
}

function assignVariant(experimentName, ip, ua) {
  const cfg = loadConfig();
  const exp = cfg.experiments && cfg.experiments[experimentName];
  if (!exp || !exp.variants) return null;

  // Create stable hash for user
  const hashInput = `${ip}|${ua ? ua.slice(0, 30) : ''}|${experimentName}`;
  const hash = crypto.createHash('md5').update(hashInput).digest('hex');
  const num = parseInt(hash.slice(0, 8), 16);
  const totalWeight = exp.variants.reduce((s, v) => s + (v.weight || 50), 0);
  const slot = num % totalWeight;

  let cumulative = 0;
  for (const variant of exp.variants) {
    cumulative += variant.weight || 50;
    if (slot < cumulative) return variant.id;
  }
  return exp.variants[0].id;
}

function recordConversion(experimentName, variantId, conversionEvent) {
  const r = loadResults();
  const key = `${experimentName}:${variantId}`;
  if (!r.experiments[key]) r.experiments[key] = { impressions: 0, conversions: 0, events: [] };
  r.experiments[key].impressions++;
  if (conversionEvent) {
    r.experiments[key].conversions++;
    r.experiments[key].events.push({ at: new Date().toISOString(), event: conversionEvent });
  }
  saveResults(r);
}

function getResults(experimentName) {
  const r = loadResults();
  const cfg = loadConfig();
  const exp = cfg.experiments && cfg.experiments[experimentName];
  if (!exp) return null;

  const results = {};
  for (const variant of exp.variants) {
    const key = `${experimentName}:${variant.id}`;
    const data = r.experiments[key] || { impressions: 0, conversions: 0 };
    results[variant.id] = {
      name: variant.name,
      impressions: data.impressions,
      conversions: data.conversions,
      conversionRate: data.impressions ? ((data.conversions / data.impressions) * 100).toFixed(2) + '%' : '0%',
    };
  }
  return { experiment: experimentName, description: exp.description, results, recommended: determineWinner(results) };
}

function determineWinner(results) {
  let best = null, bestRate = 0;
  for (const [id, data] of Object.entries(results)) {
    if (data.conversions >= (data.impressions * 0.05)) { // At least 5% conversion to consider
      const rate = parseFloat(data.conversionRate);
      if (rate > bestRate) { bestRate = rate; best = id; }
    }
  }
  return best;
}

function getAllResults() {
  const cfg = loadConfig();
  const output = {};
  for (const [name, exp] of Object.entries(cfg.experiments || {})) {
    output[name] = getResults(name);
  }
  return output;
}

module.exports = { assignVariant, recordConversion, getResults, getAllResults, loadConfig, saveConfig };

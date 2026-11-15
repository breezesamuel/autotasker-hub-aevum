/**
 * funnel-tracker.js — 免费→付费转化漏斗追踪引擎
 *
 * 追踪用户在转化漏斗各阶段的行为，识别流失点并生成优化建议。
 *
 * 漏斗阶段：
 *   1. Visit       — 访问任意页面
 *   2. Sample      — 调用 /api/x402/sample（免费试用）
 *   3. Engage      — 浏览定价页 /offer.html 或 /agent
 *   4. AttemptPay  — 尝试支付但未完成（如打开x402挑战但未签名）
 *   5. Converted   — 成功结算一笔（ledger entries 中该wallet首次出现）
 *   6. Retained    — 7天内再次调用（留存）
 *
 * 数据输出：
 *   - data/funnel/daily/YYYY-MM-DD.json：每日漏斗快照
 *   - GET /api/funnel/stats → 实时漏斗转化率
 *   - GET /api/funnel/insights → AI可读的优化建议
 *
 * 隐私：所有数据按IP+userAgent哈希聚合，不存储个人身份信息。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FUNNEL_DIR = path.join(ROOT, 'data', 'funnel');
const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

// ── 辅助函数 ─────────────────────────────────────────────────────────────────
function hashIdentity(ip, ua) {
  const raw = `${ip}|${ua ? ua.slice(0, 50) : ''}|${Date.now().toString(36)}`;
  return crypto.createHash('md5').update(raw).digest('hex').slice(0, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function loadDaily(day) {
  try {
    const f = path.join(FUNNEL_DIR, day + '.json');
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    return { day, visits: 0, samples: 0, engage: 0, converted: 0, retained: 0, topSources: {}, ipSet: new Set() };
  }
}

function saveDaily(d) {
  try {
    fs.mkdirSync(FUNNEL_DIR, { recursive: true });
    // Convert Set to array for JSON serialization
    const serializable = { ...d, ipSet: [...d.ipSet] };
    fs.writeFileSync(path.join(FUNNEL_DIR, d.day + '.json'), JSON.stringify(serializable, null, 2));
  } catch (e) { console.error('[funnel] save failed:', e.message.slice(0, 80)); }
}

// ── 核心追踪函数 ─────────────────────────────────────────────────────────────
function trackVisit(ip, ua, page) {
  const day = todayISO();
  const d = loadDaily(day);
  const id = hashIdentity(ip, ua);
  if (!d.ipSet.has(id)) {
    d.visits++;
    d.ipSet.add(id);
  }
  // Track top referrer sources
  const source = page && page.includes('/board/') ? 'board' :
                 page && page.includes('/topic/') ? 'seo-topic' :
                 page && page.includes('/blog/') ? 'blog' : 'direct';
  d.topSources[source] = (d.topSources[source] || 0) + 1;
  saveDaily(d);
  return d;
}

function trackSample(ip, ua, limit) {
  const day = todayISO();
  const d = loadDaily(day);
  d.samples++;
  saveDaily(d);
  return d;
}

function trackEngage(ip, ua, page) {
  const day = todayISO();
  const d = loadDaily(day);
  d.engage++;
  saveDaily(d);
  return d;
}

// 从ledger检测首次转化（新wallet第一次出现在entries中）
let knownWallets = new Set();
try {
  const pay = require('./payments');
  const ledger = pay.loadLedger();
  for (const e of (ledger.entries || [])) {
    if (e.agentWallet) knownWallets.add(e.agentWallet.toLowerCase());
  }
} catch (e) {}

function checkConversion(wallet) {
  const clean = wallet.toLowerCase().replace(/^0x/, '');
  const isNew = !knownWallets.has(clean) && /^[0-9a-f]{40}$/.test(clean);
  if (isNew) {
    knownWallets.add(clean);
    const day = todayISO();
    const d = loadDaily(day);
    d.converted++;
    saveDaily(d);
    return { converted: true, wallet: clean.slice(0, 6) + '…' + clean.slice(-4) };
  }
  return { converted: false };
}

// ── API端点 ───────────────────────────────────────────────────────────────────
function getStats() {
  // Aggregate last 7 days
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    try {
      const data = JSON.parse(fs.readFileSync(path.join(FUNNEL_DIR, dayStr + '.json'), 'utf8'));
      days.push({ day: dayStr, ...data });
    } catch (e) {}
  }
  days.reverse();

  const totalVisits = days.reduce((s, d) => s + (d.visits || 0), 0);
  const totalSamples = days.reduce((s, d) => s + (d.samples || 0), 0);
  const totalEngage = days.reduce((s, d) => s + (d.engage || 0), 0);
  const totalConverted = days.reduce((s, d) => s + (d.converted || 0), 0);

  return {
    period: 'last_7_days',
    generatedAt: new Date().toISOString(),
    totals: { visits: totalVisits, samples: totalSamples, engage: totalEngage, converted: totalConverted },
    conversionRates: {
      visitToSample: totalVisits ? ((totalSamples / totalVisits) * 100).toFixed(2) + '%' : '0%',
      sampleToEngage: totalSamples ? ((totalEngage / totalSamples) * 100).toFixed(2) + '%' : '0%',
      engageToConvert: totalEngage ? ((totalConverted / totalEngage) * 100).toFixed(2) + '%' : '0%',
      overall: totalVisits ? ((totalConverted / totalVisits) * 100).toFixed(2) + '%' : '0%',
    },
    daily: days,
    topSources: days.reduce((acc, d) => {
      for (const [src, count] of Object.entries(d.topSources || {})) {
        acc[src] = (acc[src] || 0) + count;
      }
      return acc;
    }, {}),
  };
}

function getInsights() {
  const stats = getStats();
  const insights = [];

  if (stats.totals.visits > 0 && stats.conversionRates.visitToSample === '0%') {
    insights.push({ severity: 'high', type: 'no_sample_usage', message: '有流量但无sample调用——考虑在landing page增加更明显的"免费试用"入口' });
  }
  if (stats.conversionRates.sampleToEngage && parseFloat(stats.conversionRates.sampleToEngage) < 20) {
    insights.push({ severity: 'medium', type: 'low_engagement', message: '试用后跳转定价页比例低——检查sample响应中是否包含明确的upgrade CTA' });
  }
  if (stats.conversionRates.overall && parseFloat(stats.conversionRates.overall) < 1) {
    insights.push({ severity: 'high', type: 'low_conversion', message: '整体转化率低于1%——建议A/B测试定价展示方式或增加社会证明（like leaderboard）' });
  }
  if (stats.totals.visits > 100 && stats.totals.converted === 0) {
    insights.push({ severity: 'critical', type: 'zero_conversions', message: '高流量零转化——可能x402支付流程有摩擦，建议在/agent页面增加更多引导' });
  }

  // Source analysis
  const sources = Object.entries(stats.topSources || {}).sort((a, b) => b[1] - a[1]);
  if (sources.length > 0) {
    insights.push({ severity: 'info', type: 'top_source', message: `主要流量来源: ${sources.map(([s, c]) => `${s}(${c})`).join(', ')}` });
  }

  return { generatedAt: new Date().toISOString(), insights, stats };
}

module.exports = { trackVisit, trackSample, trackEngage, checkConversion, getStats, getInsights };

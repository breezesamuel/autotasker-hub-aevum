/**
 * fraud-detection.js — 欺诈检测与防御层
 *
 * 三类威胁：
 *   1. Signature replay: 同一 txHash 重复结算
 *   2. Rate abuse: 单钱包短时间内超高调用频率（bot/proxy）
 *   3. Price manipulation: 异常低价请求（折扣叠加超过阈值仍被接受）
 *
 * 端点：
 *   GET  /api/fraud/scan          — 扫描所有异常模式（返回报告）
 *   POST /api/fraud/block         — 将某钱包加入黑名单
 *   GET  /api/fraud/blacklist     — 查看当前黑名单
 *   GET  /api/fraud/stats         — 统计汇总（今日拦截数、可疑率等）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOCKLIST_FILE = path.join(ROOT, 'data', 'fraud-blocklist.json');
const ALARM_FILE = path.join(ROOT, 'data', 'fraud-alarms.json');

// Thresholds (configurable)
const THRESHOLDS = {
  maxCallsPerHour: 500,        // 单钱包每小时上限
  maxCallsPerMinute: 30,       // 单钱包每分钟上限
  minPriceAtomic: 1000,        // 单次最低价格（$0.001）
  maxDiscountBps: 4000,        // 最大合法折扣（40%）
  duplicateTxWindowMin: 60,    // txHash重复判定窗口（分钟）
};

function loadBlocklist() {
  try { return JSON.parse(fs.readFileSync(BLOCKLIST_FILE, 'utf8')); }
  catch (e) { return { version: 1, blocked: [], createdAt: null }; }
}
function saveBlocklist(bl) {
  bl.createdAt = bl.createdAt || new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(BLOCKLIST_FILE), { recursive: true });
    fs.writeFileSync(BLOCKLIST_FILE, JSON.stringify(bl, null, 2));
  } catch (ex) {}
}
function loadAlarms() {
  try { return JSON.parse(fs.readFileSync(ALARM_FILE, 'utf8')); }
  catch (e) { return { version: 1, alarms: [] }; }
}
function appendAlarm(alarm) {
  const a = loadAlarms();
  a.alarms.push({ ...alarm, detectedAt: new Date().toISOString() });
  if (a.alarms.length > 1000) a.alarms = a.alarms.slice(-1000);
  try {
    fs.mkdirSync(path.dirname(ALARM_FILE), { recursive: true });
    fs.writeFileSync(ALARM_FILE, JSON.stringify(a, null, 2));
  } catch (ex) {}
}

function checkSignatureReplay(txHash, entries) {
  if (!txHash) return false;
  for (const e of entries) {
    if (e.txHash === txHash && e.ts) {
      const hoursAgo = (Date.now() - new Date(e.ts).getTime()) / 3600000;
      if (hoursAgo < THRESHOLDS.duplicateTxWindowMin / 60) {
        return true;
      }
    }
  }
  return false;
}

function checkRateAbuse(wallet, entries) {
  if (!wallet) return null;
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  const oneMinuteAgo = now - 60000;
  let hCount = 0, mCount = 0;
  for (const e of entries) {
    if ((e.agentWallet || '').toLowerCase() !== wallet.toLowerCase()) continue;
    const t = new Date(e.ts).getTime();
    if (t > oneHourAgo) hCount++;
    if (t > oneMinuteAgo) mCount++;
  }
  const issues = [];
  if (hCount > THRESHOLDS.maxCallsPerHour) issues.push({ type: 'hourly_abuse', count: hCount });
  if (mCount > THRESHOLDS.maxCallsPerMinute) issues.push({ type: 'minute_abuse', count: mCount });
  return issues.length ? { wallet: wallet.slice(0, 10) + '…' + wallet.slice(-4), hourly: hCount, minute: mCount, issues } : null;
}

function checkPriceManipulation(priceUsd, tool) {
  const basePrices = { hotlist: 0.05, search: 0.05, full: 0.50, util: 0.01 };
  const base = basePrices[tool] || 0.01;
  if (base === 0) return null;
  const discountBps = Math.round((1 - priceUsd / base) * 10000);
  if (discountBps > THRESHOLDS.maxDiscountBps) {
    return { type: 'price_manipulation', priceUsd, basePriceUsd: base, discountBps };
  }
  if (priceUsd * 1e6 < THRESHOLDS.minPriceAtomic) {
    return { type: 'below_minimum', priceUsd, minAtomic: THRESHOLDS.minPriceAtomic };
  }
  return null;
}

function scanAll(entries) {
  // Group by wallet
  const byWallet = {};
  for (const e of entries) {
    const w = (e.agentWallet || '').toLowerCase();
    if (!w) continue;
    if (!byWallet[w]) byWallet[w] = [];
    byWallet[w].push(e);
  }

  const results = {
    scannedAt: new Date().toISOString(),
    totalEntries: entries.length,
    walletsScanned: Object.keys(byWallet).length,
    suspicious: [],
    blocklist: loadBlocklist(),
    stats: { totalAlarmsToday: 0, repeatedSignatures: 0, rateAbusers: 0, priceAnomalies: 0 },
  };

  // Track seen txHashes for replay detection
  const seenTxHashes = new Map();
  for (const e of entries) {
    if (e.txHash) {
      seenTxHashes.set(e.txHash, (seenTxHashes.get(e.txHash) || 0) + 1);
    }
  }

  // Check each wallet
  for (const [wallet, wEntries] of Object.entries(byWallet)) {
    // Sort by time desc
    wEntries.sort((a, b) => new Date(b.ts) - new Date(a.ts));

    // Rate abuse check
    const rateIssue = checkRateAbuse(wallet, wEntries);
    if (rateIssue) {
      results.suspicious.push(rateIssue);
      results.stats.rateAbusers++;
      appendAlarm({ type: 'rate_abuse', severity: 'high', wallet, details: rateIssue.issues });
    }

    // Price manipulation check
    for (const e of wEntries.slice(0, 5)) {
      const priceIssue = checkPriceManipulation(Number(e.priceUsd) || 0, e.endpoint || 'util');
      if (priceIssue) {
        results.suspicious.push({ type: 'price_anomaly', wallet: wallet.slice(0, 10) + '…' + wallet.slice(-4), detail: priceIssue });
        results.stats.priceAnomalies++;
        appendAlarm({ type: 'price_anomaly', severity: 'medium', wallet, detail: priceIssue });
      }
    }
  }

  // Signature replay (global)
  for (const [txHash, count] of seenTxHashes) {
    if (count > 1) {
      results.stats.repeatedSignatures++;
      appendAlarm({ type: 'signature_replay', severity: 'critical', txHash, count });
    }
  }

  // Today's alarm count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  try {
    const alarms = loadAlarms();
    results.stats.totalAlarmsToday = alarms.alarms.filter(a =>
      new Date(a.detectedAt) >= todayStart
    ).length;
  } catch (e) {}

  return results;
}

function addToBlocklist(wallet, reason) {
  const bl = loadBlocklist();
  if (!bl.blocked) bl.blocked = [];
  // Avoid duplicates
  if (bl.blocked.find(b => b.wallet.toLowerCase() === wallet.toLowerCase())) {
    return { ok: false, reason: 'already blocked' };
  }
  bl.blocked.push({ wallet: wallet.toLowerCase(), reason, addedAt: new Date().toISOString() });
  saveBlocklist(bl);
  appendAlarm({ type: 'blocklist_add', severity: 'info', wallet, reason });
  return { ok: true, wallet: wallet.slice(0, 10) + '…' + wallet.slice(-4), totalBlocked: bl.blocked.length };
}

function getBlocklist() {
  return loadBlocklist();
}

function getStats() {
  const bl = loadBlocklist();
  const alarms = loadAlarms();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return {
    blocklistSize: (bl.blocked || []).length,
    totalAlarms: alarms.alarms.length,
    alarmsToday: alarms.alarms.filter(a => new Date(a.detectedAt) >= todayStart).length,
    recentAlarms: alarms.alarms.slice(-10).reverse(),
    thresholds: THRESHOLDS,
  };
}

module.exports = {
  THRESHOLDS, scanAll, addToBlocklist, getBlocklist, getStats,
  checkSignatureReplay, checkRateAbuse, checkPriceManipulation,
};

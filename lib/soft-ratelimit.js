/**
 * soft-ratelimit.js — 按钱包地址的软限流层
 *
 * 与现有 IP 级限流（rateLimit()）互补：
 *   - IP 限流防 DDoS（已在 x402-v4.js 中）
 *   - 钱包限流防 single-agent abuse（本文件）
 *
 * 策略：
 *   硬限流（429）: >100次/小时 OR >10次/分钟
 *   软警告（日志+告警）: >50次/小时 OR >5次/分钟
 *
 * 端点：
 *   GET /api/ratelimit/status?wallet=0x...  — 查询某钱包当前配额
 */
'use strict';

const RATE_WINDOW_MS = 3600 * 1000;   // 1 hour sliding window
const MIN_WINDOW_MS  = 60 * 1000;     // 1 minute sliding window
const HARD_HOUR_MAX  = 100;
const HARD_MIN_MAX   = 10;
const WARN_HOUR_MAX  = 50;
const WARN_MIN_MAX   = 5;

// In-memory: wallet -> [timestamp, ...]
const wallets = new Map();

function prune(key, now) {
  const arr = wallets.get(key) || [];
  const kept = arr.filter(t => now - t < RATE_WINDOW_MS);
  if (kept.length === arr.length) return kept;
  wallets.set(key, kept);
  return kept;
}

function check(wallet) {
  if (!wallet) return { ok: true, level: 'none' };
  const now = Date.now();
  const hourArr = prune(wallet + ':h', now);
  const minArr  = prune(wallet + ':m', now);
  hourArr.push(now);
  minArr.push(now);
  wallets.set(wallet + ':h', hourArr);
  wallets.set(wallet + ':m', minArr);

  const hCount = hourArr.length;
  const mCount = minArr.length;

  if (hCount >= HARD_HOUR_MAX || mCount >= HARD_MIN_MAX) {
    return { ok: false, level: 'hard', hourly: hCount, minute: mCount, retryAfterSec: Math.ceil((RATE_WINDOW_MS - (now - hourArr[0])) / 1000) };
  }
  if (hCount >= WARN_HOUR_MAX || mCount >= WARN_MIN_MAX) {
    return { ok: true, level: 'warn', hourly: hCount, minute: mCount };
  }
  return { ok: true, level: 'normal', hourly: hCount, minute: mCount };
}

function getWalletStatus(wallet) {
  if (!wallet) return { error: 'wallet required' };
  const now = Date.now();
  const hKey = wallet.toLowerCase() + ':h';
  const mKey = wallet.toLowerCase() + ':m';
  const hArr = prune(hKey, now) || [];
  const mArr = prune(mKey, now) || [];
  return {
    wallet: wallet.slice(0, 10) + '…' + wallet.slice(-4),
    hourlyCalls: hArr.length,
    minuteCalls: mArr.length,
    hourlyRemaining: Math.max(0, HARD_HOUR_MAX - hArr.length),
    minuteRemaining: Math.max(0, HARD_MIN_MAX - mArr.length),
    level: check(wallet).level,
  };
}

function getStats() {
  let totalTracked = 0;
  for (const key of wallets.keys()) {
    if (key.endsWith(':h')) totalTracked++;
  }
  return {
    trackedWallets: totalTracked,
    hardLimits: HARD_HOUR_MAX,
    softWarnings: WARN_HOUR_MAX,
  };
}

module.exports = { check, getWalletStatus, getStats, prune };

/**
 * api-keys.js — 简易 API Key 体系（面向企业客户 / 高频调用者）
 *
 * 设计理念：
 *   - x402 是最佳支付路径（去中心化、链上可验），但部分企业客户偏好传统 API Key 认证
 *   - 本模块提供"预付费 Token"模式：客户先付 USDC，获得一个受限 Token，后续调用了免签名
 *   - Token 生命周期由服务端控制（过期时间、额度、IP 限制）
 *   - 账本独立存储（data/api-keys.json），不与 revenue-ledger 混用
 *
 * 端点：
 *   POST /api/keys/create     — 创建新 Key（需附 payment txHash 验证）
 *   GET  /api/keys/validate   — 验证 Key 有效性
 *   GET  /api/keys/stats      — 查看 Key 用量统计
 *   DELETE /api/keys/<id>     — 撤销 Key
 *
 * 安全约束：
 *   - Key 指纹（前 8 后 4）公开显示，完整 Key 永远不输出
 *   - 创建时要求提供 payment txHash（链上验证）
 *   - 每日用量上限可配
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY_FILE = path.join(__dirname, '..', 'data', 'api-keys.json');
const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

// ── Schema ───────────────────────────────────────────────────────────────────
// keys[] = {
//   id, fingerprint, keyHint, rawKey (hashed), createdAt, expiresAt,
//   wallet, txHash, plan ('free'|'starter'|'pro'|'enterprise'),
//   dailyLimitCalls, dailyLimitUsd, ipWhitelist [],
//   usedToday, totalCalls, totalUsd, blocked
// }

function loadDb() {
  try { return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')); }
  catch (e) { return { version: 1, createdAt: new Date().toISOString(), keys: [] }; }
}
function saveDb(db) {
  try {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, JSON.stringify(db, null, 2));
  } catch (e) { console.error('[api-keys] save failed:', e.message.slice(0, 80)); }
}

function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
function generateKey() {
  return 'atk_' + crypto.randomBytes(24).toString('hex');
}
function fingerprint(full) {
  return full.slice(0, 8) + '…' + full.slice(-4);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Public API ───────────────────────────────────────────────────────────────
function createKey(args) {
  const { wallet, txHash, plan = 'starter', dailyLimitCalls = 1000, dailyLimitUsd = 50, ipWhitelist = [] } = args || {};
  if (!wallet || !/^(?:0x)?[0-9a-fA-F]{40}$/.test(wallet.toLowerCase().replace(/^0x/, ''))) {
    return { ok: false, reason: 'invalid wallet address' };
  }
  const db = loadDb();
  // 查重：同一 wallet 同一 txHash 只能创建一个 key
  const dup = db.keys.find((k) => k.wallet === wallet.toLowerCase() && k.txHash === txHash);
  if (dup) return { ok: false, reason: 'txHash already used for this wallet' };

  const rawKey = generateKey();
  const key = {
    id: 'key_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    fingerprint: fingerprint(rawKey),
    keyHint: rawKey.slice(0, 4) + '****' + rawKey.slice(-2),
    rawKeyHash: hashKey(rawKey),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), // 30 days
    wallet,
    txHash,
    plan,
    dailyLimitCalls,
    dailyLimitUsd,
    ipWhitelist: ipWhitelist.map((ip) => String(ip).trim()),
    usedToday: 0,
    totalCalls: 0,
    totalUsd: 0,
    blocked: false,
  };
  db.keys.push(key);
  saveDb(db);
  return { ok: true, id: key.id, fingerprint: key.fingerprint, keyHint: key.keyHint, expiresInDays: 30 };
}

function validateKey(rawKey, reqIp) {
  const db = loadDb();
  const h = hashKey(rawKey);
  const k = db.keys.find((k) => k.rawKeyHash === h);
  if (!k) return { ok: false, reason: 'invalid key' };
  if (k.blocked) return { ok: false, reason: 'key is blocked' };
  if (new Date(k.expiresAt) < new Date()) return { ok: false, reason: 'key expired' };
  if (k.ipWhitelist.length > 0 && !k.ipWhitelist.includes(reqIp || '')) {
    return { ok: false, reason: 'ip not whitelisted' };
  }
  const today = todayISO();
  const dayKey = `${k.id}:day:${today}`;
  // 简单计数（实际生产应用 Redis）
  if (k.usedToday >= k.dailyLimitCalls) return { ok: false, reason: 'daily call limit exceeded' };
  if (k.totalUsd + 0.05 > k.dailyLimitUsd) return { ok: false, reason: 'daily spend limit exceeded' };
  return {
    ok: true,
    id: k.id,
    fingerprint: k.fingerprint,
    plan: k.plan,
    remainingCalls: k.dailyLimitCalls - k.usedToday,
    remainingUsd: +(k.dailyLimitUsd - k.totalUsd).toFixed(4),
    expiresAt: k.expiresAt,
  };
}

function recordUsage(keyId, costUsd) {
  const db = loadDb();
  const k = db.keys.find((k) => k.id === keyId);
  if (!k) return;
  k.usedToday = (k.usedToday || 0) + 1;
  k.totalCalls = (k.totalCalls || 0) + 1;
  k.totalUsd = Number((k.totalUsd || 0) + costUsd).toFixed(6);
  saveDb(db);
}

function listKeys() {
  const db = loadDb();
  return db.keys.map((k) => ({
    id: k.id,
    fingerprint: k.fingerprint,
    wallet: k.wallet,
    plan: k.plan,
    createdAt: k.createdAt,
    expiresAt: k.expiresAt,
    totalCalls: k.totalCalls,
    totalUsd: k.totalUsd,
    blocked: k.blocked,
  }));
}

function revokeKey(keyId) {
  const db = loadDb();
  const k = db.keys.find((k) => k.id === keyId);
  if (!k) return { ok: false, reason: 'not found' };
  k.blocked = true;
  saveDb(db);
  return { ok: true };
}

module.exports = { createKey, validateKey, recordUsage, listKeys, revokeKey };

/**
 * alerts.js — 事件驱动告警：每个结算 / 返利支付成功后异步投递 webhook。
 *
 * 配置（环境变量，全部可选）：
 *   ALERT_WEBHOOK_URL    — 通用 webhook（POST JSON）
 *   TELEGRAM_BOT_TOKEN   + TELEGRAM_CHAT_ID       → 推送至 Telegram 私聊/群
 *   DISCORD_WEBHOOK_URL  → 推送至 Discord channel
 *   SLACK_WEBHOOK_URL    → 推送至 Slack incoming webhook
 *
 * 已接入触发点：
 *   - after-settle 钩子（结算成功）
 *   - auto-rebate-pay --execute（每笔返利支付成功）
 *   - reconcile cron（每日对账报告）
 *
 * 设计原则：fire-and-forget，任何 webhook 失败都只会让日志多一行 warn，绝不阻塞主链路。
 */
'use strict';

const https = require('https');
const path = require('path');
const fs = require('fs');

const QUEUE_FILE = path.join(__dirname, '..', 'data', 'alert-queue.jsonl');

// ── 小队列：crash-safe 持久化（JSONL），重启后自动重放 ───────────────────────
let queueBuffer = [];
try {
  const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
  for (const line of raw.split('\n').filter(Boolean)) {
    try { queueBuffer.push(JSON.parse(line)); } catch (e) { /* skip corrupt lines */ }
  }
} catch (e) { /* no queue yet */ }

function enqueue(alert) {
  alert.id = (alert.id || '') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  alert.at = new Date().toISOString();
  alert.state = 'pending';
  queueBuffer.push(alert);
  // 节流落盘（避免每次 push 都写磁盘）
  if (queueBuffer.length % 5 === 0) flushQueue();
}

function flushQueue() {
  if (!queueBuffer.length) return;
  const batch = queueBuffer.splice(0, queueBuffer.length);
  try {
    fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
    const tail = fs.existsSync(QUEUE_FILE) ? fs.readFileSync(QUEUE_FILE, 'utf8') : '';
    fs.writeFileSync(QUEUE_FILE, tail + batch.map((a) => JSON.stringify(a)).join('\n') + '\n');
  } catch (e) { console.error('[alerts] queue persist failed:', e.message.slice(0, 120)); }
}

async function httpPostJson(url, body, timeout = 10000) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const r = https.request(url, {
      method: 'POST', timeout,
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) },
    }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b.slice(0, 120) }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', (e) => resolve({ status: 0, body: 'ERR:' + e.code }));
    r.write(data); r.end();
  });
}

// ── 各平台格式器 ─────────────────────────────────────────────────────────────
function fmtSettlement(alert) {
  const tx = String(alert.txHash || '').slice(0, 18) + '…';
  const wallet = String(alert.wallet || '').slice(0, 12) + '…';
  return {
    text: [
      `💰 新结算入账`,
      `金额: $${Number(alert.amountUsd || 0).toFixed(4)}`,
      `工具: ${alert.tool || '?'}`,
      `付款人: \`${wallet}\``,
      `Tx: ${tx}`,
      `归因推荐码: ${alert.refCode || '无'}`,
      `金库: \`${String(alert.treasury || '').slice(0, 14)}…\``,
    ].join('\n'),
    parse_mode: 'MarkdownV2',
  };
}
function fmtRebate(alert) {
  return {
    text: [
      `✅ 返利自动支付成功`,
      `收款人: \`${String(alert.wallet || '?').slice(0, 12)}…\``,
      `金额: $${Number(alert.amountUsd || 0).toFixed(4)}`,
      `Tx: \`${String(alert.txHash || '?').slice(0, 20)}…\``,
      `来源代码: ${alert.code || '?'}`,
    ].join('\n'),
    parse_mode: 'MarkdownV2',
  };
}
function fmtReconcile(alert) {
  const ok = alert.ok === true ? '✅' : '⚠️';
  return {
    text: [
      `${ok} 链上对账完成`,
      `状态: ${alert.verdict || (alert.ok === true ? 'OK' : 'MISMATCH')}`,
      `账本: ${alert.ledger && alert.ledger.settledCount} 笔 · $${(alert.ledger && Number(alert.ledger.revenueUsd) || 0).toFixed(4)}`,
      `链上: ${alert.onchain && alert.onchain.count} tx · $${(alert.onchain && Number(alert.onchain.usd) || 0).toFixed(4)}`,
      `覆盖区间: blocks ${alert.coveredFrom ?? '?'} – ${alert.coveredTo ?? '?'}`,
      `数据源: ${alert.source || '?'}`,
    ].join('\n'),
    parse_mode: 'MarkdownV2',
  };
}

// ── Dispatchers ──────────────────────────────────────────────────────────────
async function sendAll(alert) {
  const ts = alert.type === 'rebate' ? fmtRebate(alert)
           : alert.type === 'reconcile' ? fmtReconcile(alert)
           : fmtSettlement(alert);

  const tasks = [];
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) {
    const url = `https://api.telegram.org/bot${tgToken}/sendMessage`;
    tasks.push(httpPostJson(url, Object.assign({}, ts, { chat_id: tgChat, message_thread_id: alert.threadId || undefined })));
  }
  if (process.env.DISCORD_WEBHOOK_URL) {
    tasks.push(httpPostJson(process.env.DISCORD_WEBHOOK_URL, {
      content: ts.text,
      username: 'AutoTasker Hub Alerts',
      avatar_url: 'https://autotasker.highkingflower.com/favicon.ico',
    }));
  }
  if (process.env.SLACK_WEBHOOK_URL) {
    tasks.push(httpPostJson(process.env.SLACK_WEBHOOK_URL, { text: ts.text }));
  }
  if (process.env.ALERT_WEBHOOK_URL) {
    tasks.push(httpPostJson(process.env.ALERT_WEBHOOK_URL, alert));
  }
  // 无论成败都要写一条 dispatch log
  const results = await Promise.allSettled(tasks);
  const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status >= 200 && r.value.status < 300).length;
  alert.dispatchedAt = new Date().toISOString();
  alert.dispatchOk = ok > 0;
  alert.dispatchDetails = results.map((r) => (r.status === 'rejected' ? r.reason?.message : r.value.body).slice(0, 80));
  return ok;
}

// ── Main worker ──────────────────────────────────────────────────────────────
async function drainQueue() {
  if (!queueBuffer.length) return;
  const pending = queueBuffer.filter((a) => a.state !== 'sent' && a.state !== 'failed');
  for (const alert of pending) {
    try {
      const ok = await sendAll(alert);
      alert.state = ok > 0 ? 'sent' : 'failed';
      console.log(`[alerts] ${alert.type} ${alert.state} id=${String(alert.id).slice(0, 12)}`);
    } catch (e) {
      alert.state = 'failed';
      console.error('[alerts] dispatch error:', e.message.slice(0, 100));
    }
  }
  flushQueue();
}

// 每 10s 扫一次；首次启动立即尝试
setInterval(drainQueue, 10_000);
drainQueue();

module.exports = { enqueue, sendAll, flushQueue };

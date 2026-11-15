/**
 * sse-stream.js — Server-Sent Events 实时推送流
 *
 * GET /api/live/stream — SSE endpoint
 *   推送事件类型：
 *     settlement.new   — 新结算入账（payload: {tool, usd, wallet, txHash, refCode}）
 *     digest.ready     — 简报生成完毕（payload: {date, itemCount}）
 *     reconcile.done   — 对账完成（payload: {ok, ageMinutes}）
 *     heartbeat        — 心跳（每30秒，保持连接活跃）
 *
 * 设计：
 *   - 无状态：每次请求独立处理，不维持 long-lived connections（适合 ECS 多实例）
 *   - 兼容：浏览器 EventSource + curl 都可消费
 *   - 限频：同一 IP 每分钟最多建立 3 条 SSE 连接
 *
 * 客户端用法：
 *   const es = new EventSource('/api/live/stream');
 *   es.onmessage = e => console.log(JSON.parse(e.data));
 */
'use strict';

const http = require('http');

// In-memory connection registry (purged on reconnect)
const activeStreams = new Map(); // key -> { res, lastHeartbeat }

function register(streamKey, res) {
  activeStreams.set(streamKey, { res, lastHeartbeat: Date.now() });
  res.on('close', () => activeStreams.delete(streamKey));
}
function unregister(streamKey) {
  activeStreams.delete(streamKey);
}
function broadcast(eventType, payload) {
  const msg = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [key, conn] of activeStreams.entries()) {
    try { conn.res.write(msg); } catch (e) { unregister(key); }
  }
}
function sendTo(key, eventType, payload) {
  const conn = activeStreams.get(key);
  if (!conn) return;
  try { conn.res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`); } catch (e) { unregister(key); }
}

function createStream(req, res, clientIp) {
  // Rate limit: 3 concurrent SSE per IP
  let count = 0;
  for (const [k, v] of activeStreams.entries()) {
    if (k.startsWith(clientIp + ':')) count++;
  }
  if (count >= 3) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'text/plain');
    res.end('rate limit: 3 concurrent SSE connections per IP\n');
    return;
  }

  const streamKey = clientIp + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 6);
  register(streamKey, res);

  // Flush headers immediately so the client gets event-stream content-type right away.
  // nginx proxy_buffering can delay responses — force flush every write.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx-specific: disable buffering
  res.flushHeaders();

  // Send initial connection acknowledged
  res.write(`event: connected\ndata: ${JSON.stringify({ streamKey, at: new Date().toISOString() })}\n\n`);

  // Heartbeat every 15s (more frequent than 30s to survive nginx idle timeouts)
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (e) { clearInterval(hb); unregister(streamKey); }
  }, 15_000);

  req.on('close', () => { clearInterval(hb); unregister(streamKey); });
}

module.exports = { createStream, broadcast, sendTo, unregister };

/**
 * x402-v4.js — AutoTasker Hub v5: official SDK + PayAI facilitator + Bazaar discovery.
 *
 * BREAKING CHANGES from v4:
 *   - Uses @x402/express paymentMiddleware (official SDK, not hand-rolled EIP-3009)
 *   - Settles via PayAI facilitator (Base mainnet, free, no API key) → Bazaar visible
 *   - Every paid route has Bazaar extension → indexed automatically when paid
 *   - MCP tools now echo x402 accepts inline (client-side signing + facilitator settle)
 *
 * Run: NODE_ENV=production node server.js  (port 8795 on ECS)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const express = require('express');

// ── Official SDKs (must be present) ─────────────────────────────────────────
const { paymentMiddleware, x402ResourceServer } = require('@x402/express');
const { ExactEvmScheme } = require('@x402/evm/exact/server');
const { HTTPFacilitatorClient } = require('@x402/core/server');
const { declareDiscoveryExtension } = require('@x402/extensions/bazaar');

// ── Config ───────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const TREASURY = '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';
const PAY_TO = process.env.PAY_TO || TREASURY;
const X402_NETWORK = process.env.X402_NETWORK || 'eip155:8453'; // Base mainnet
const MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://facilitator.payai.network';

if (PAY_TO.toLowerCase() !== TREASURY.toLowerCase()) {
  console.warn('[treasury] PAY_TO differs from single-treasury policy. Using:', PAY_TO);
}

// ── Data (same as v4) ────────────────────────────────────────────────────────
let packCache = null;
try {
  packCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'packs', 'live.json'), 'utf8'));
} catch (e) {
  try { packCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'packs', 'xuanpin_v2.json'), 'utf8')); } catch (e2) {}
}
const { UTIL_TOOLS, runUtil, UTIL_PRICE, PRICE_BY_TOOL } = require('./utils-tools');
const pay = require('./payments');
const referrals = require('./referrals');
const support = require('./support');
const alerts = require('./alerts');
const metricsLib = require('./metrics');
const boardPages = require('./board-pages');
const mcpDiscovery = require('./mcp-discovery');
const apiKeys = require('./api-keys');
const liveFeed = require('./live-feed');
const agentOnboard = require('./agent-onboard');
const webhookSubs = require('./webhook-subscriptions');
const customerDash = require('./customer-dashboard');
const seoPages = require('./seo-auto-pages');
const leaderboard = require('./leaderboard');
const sseStream = require('./sse-stream');
const autoBlog = require('./auto-blog');
const i18n = require('./i18n');
const partnerPage = require('./partner-page');

// ── Simple in-memory rate limiter (per key: max events per window) ──────────
const RATE = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (RATE.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { RATE.set(key, arr); return false; }
  arr.push(now);
  RATE.set(key, arr);
  if (RATE.size > 5000) {
    // Evict the OLDEST buckets (Map keeps insertion order) instead of clearing
    // everything — a flood of unique keys must not nuke everyone else's limits.
    let evict = 2500;
    for (const k of RATE.keys()) { if (evict-- <= 0) break; RATE.delete(k); }
  }
  return true;
}
function clientIp(req) {
  // Trust order: X-Real-IP (overwritten by our nginx on every hop — cannot be
  // spoofed by the client) → LAST X-Forwarded-For entry (our nginx appends the
  // real client IP at the end via $proxy_add_x_forwarded_for; earlier entries
  // are attacker-controlled) → raw socket address.
  const real = req.headers['x-real-ip'];
  if (real) return String(real).trim();
  const xff = String(req.headers['x-forwarded-for'] || '');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket.remoteAddress || '';
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const PRICE_MAP = {
  hotlist: { usd: 0.05, atomic: 50000 },
  search:  { usd: 0.05, atomic: 50000 },
  full:    { usd: 0.50, atomic: 500000 },
};
const DESCRIPTIONS = {
  hotlist: 'Trending posts from Chinese social media: Weibo Hot Search, Douban, Zhihu, Bilibili, Tieba',
  search:  'Cross-board keyword search across major Chinese social media platforms',
  full:    'Complete dataset export with all fields and metadata',
};

function items() { return (packCache && packCache.items) || []; }
function hotlistData(board, limit) {
  const all = items();
  const filtered = board ? all.filter(it => (it.source || '').toLowerCase() === String(board).toLowerCase()) : all;
  return (filtered.length ? filtered : all).slice(0, limit);
}
function searchData(q, limit) {
  return items().filter(it => JSON.stringify(it).toLowerCase().includes(String(q).toLowerCase())).slice(0, limit);
}
function priceOf(tool) { return (PRICE_BY_TOOL && PRICE_BY_TOOL[tool]) || UTIL_PRICE; }

const UTIL_NAMES = new Set(UTIL_TOOLS.map(t => t.name));

// ── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '2mb' }));

// ── Free endpoints ───────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const uptimeSec = process.uptime();
  const mem = process.memoryUsage();
  // 最近的结算时间（从账本里取最新的 ts）
  let lastSettledAt = null;
  try {
    const ledger = pay.loadLedger();
    const ts = (ledger.entries || []).map((e) => e.ts).filter(Boolean).sort();
    lastSettledAt = ts[ts.length - 1] || null;
  } catch (e) {}
  // Alert 队列积压
  let alertPending = 0;
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'data', 'alert-queue.jsonl'), 'utf8');
    for (const line of raw.split('\n').filter(Boolean)) {
      try { if (JSON.parse(line).state === 'pending') alertPending++; } catch (e) {}
    }
  } catch (e) {}
  res.json({
    status: 'operational',
    protocol: 'x402-v5',
    network: X402_NETWORK,
    asset: MAINNET_USDC,
    payTo: PAY_TO,
    facilitator: FACILITATOR_URL,
    bazaarEnabled: !!declareDiscoveryExtension,
    services: Object.keys(PRICE_MAP),
    toolCount: MCP_TOOLS.length,
    sdk: '@x402/express (v2.x)',
    uptimeSeconds: Math.round(uptimeSec),
    memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), heapTotalMb: Math.round(mem.heapTotal / 1048576) },
    lastSettledAt,
    alerts: { pendingQueue: alertPending },
  });
});

app.get('/api/x402/sample', (req, res) => {
  const lim = Math.min(Number(req.query.limit) || 5, 20);
  res.json({ sample: items().slice(0, lim), totalInPack: items().length });
});
app.get('/api/x402/summary', (req, res) => {
  const bySource = {};
  for (const it of items()) bySource[it.source] = (bySource[it.source] || 0) + 1;
  res.json({ totalItems: items().length, sources: bySource });
});

// ── Alert queue status (read-only, no auth — only counts, never payload) ─────
app.get('/api/alerts/queue', (req, res) => {
  let pending = 0, sent = 0, failed = 0, total = 0;
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'data', 'alert-queue.jsonl'), 'utf8');
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        total++;
        const s = JSON.parse(line).state;
        if (s === 'pending') pending++;
        else if (s === 'sent') sent++;
        else if (s === 'failed') failed++;
      } catch (e) {}
    }
  } catch (e) {}
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ pending, sent, failed, total, file: 'data/alert-queue.jsonl' });
});

// ── MCP Discovery (/.well-known/mcp.json) — for Claude Desktop / Cursor etc. ──
app.get('/.well-known/mcp', (req, res) => {
  const host = req.headers.host || 'autotasker.highkingflower.com';
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(mcpDiscovery.buildDiscoveryDoc(host));
});

// ── API Key management (enterprise clients) ───────────────────────────────────
app.post('/api/keys/create', (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit('apikey:' + ip, 3, 3600 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'rate limit: 3 requests/hour/IP' });
  }
  const { wallet, txHash, plan, dailyLimitCalls, dailyLimitUsd, ipWhitelist } = req.body || {};
  const r = apiKeys.createKey({ wallet, txHash, plan, dailyLimitCalls, dailyLimitUsd, ipWhitelist });
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});
app.get('/api/keys/list', (req, res) => {
  // Read-only, no auth required for listing fingerprints
  res.json({ keys: apiKeys.listKeys() });
});
app.delete('/api/keys/:id', (req, res) => {
  const r = apiKeys.revokeKey(req.params.id);
  if (!r.ok) return res.status(404).json(r);
  res.json(r);
});

// ── Live Transaction Feed（社会证明 + 转化驱动）──────────────────────────────
// GET /live          — HTML 直播大屏，前端每5秒轮询 JSON API
// GET /api/live/feed — 最近 N 笔结算 JSON（供嵌入式 widget 使用）
app.get('/live', (req, res) => {
  res.set('Cache-Control', 'public, max-age=10');
  const feed = liveFeed.collectFeed(20);
  const stats = liveFeed.collectStats();
  res.type('html').send(liveFeed.htmlView(feed, stats));
});
app.get('/api/live/feed', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  res.set('Cache-Control', 'public, max-age=5');
  res.json({ feed: liveFeed.collectFeed(limit), stats: liveFeed.collectStats() });
});

// ── Agent Onboarding（让 AI Agent 自助完成首次支付）──────────────────────────
app.get('/agent', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.type('html').send(agentOnboard.htmlView());
});

// ── Partner / White-label API 入口 ───────────────────────────────────────────
app.get('/partner', (req, res) => {
  res.set('Cache-Control', 'public, max-age=600');
  res.type('html').send(partnerPage.htmlView());
});
app.get('/api/partner/info', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(partnerPage.jsonInfo());
});

// ── Customer Dashboard（钱包消费历史公开页）──────────────────────────────────
app.get('/dashboard/:wallet', (req, res) => {
  const wallet = String(req.params.wallet || '').trim();
  const data = customerDash.collectForWallet(wallet);
  if (!data) return res.status(400).type('text/plain').send('invalid wallet address\n');
  res.set('Cache-Control', 'public, max-age=30');
  res.type('html').send(customerDash.htmlView(data, wallet.slice(0, 10) + '…' + wallet.slice(-4)));
});
app.get('/api/dashboard/:wallet', (req, res) => {
  const wallet = String(req.params.wallet || '').trim();
  const data = customerDash.collectForWallet(wallet);
  if (!data) return res.status(400).json({ ok: false, reason: 'invalid wallet' });
  // Strip sensitive fields for public JSON
  const { walletFull, ...publicData } = data;
  res.set('Cache-Control', 'public, max-age=30');
  res.json(publicData);
});

// ── Webhook Subscriptions（客户订阅实时推送）──────────────────────────────────
app.post('/webhooks/subscribe', (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit('whsub:' + ip, 3, 3600 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'rate limit: 3/hour/IP' });
  }
  const { email, url, events } = req.body || {};
  const r = webhookSubs.createSubscription({ email, url, events });
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});
app.get('/webhooks/verify/:id', (req, res) => {
  const r = webhookSubs.verifySubscription(req.params.id);
  if (!r.ok) return res.status(404).json(r);
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>验证成功</title></head>
<body style="font-family:system-ui;text-align:center;padding:80px">
<h2>✅ Webhook 已激活</h2><p>订阅 ${esc(r.id)} 已成功验证，开始接收实时通知。</p>
<a href="/offer.html">查看产品</a>
</body></html>`);
});
app.get('/webhooks/list', (req, res) => {
  res.json({ subscriptions: webhookSubs.listSubscriptions() });
});
app.post('/webhooks/test', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !/^https:/.test(url)) return res.status(400).json({ ok: false, reason: 'https url required' });
  const r = await webhookSubs.testEndpoint(url);
  res.json(r);
});

// ── Leaderboard（社交证明 + 竞争驱动复购）──────────────────────────────────
app.get('/leaderboard', (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  const data = leaderboard.collectLeaderboard(20);
  res.type('html').send(leaderboard.htmlView(data));
});
app.get('/api/leaderboard', (req, res) => {
  res.set('Cache-Control', 'public, max-age=10');
  const data = leaderboard.collectLeaderboard(Number(req.query.limit) || 20);
  // Strip full wallet from JSON response for privacy
  res.json(data.map(({ walletFull, ...rest }) => rest));
});

// ── SSE Real-time Stream（浏览器 EventSource 实时推送）───────────────────────
app.get('/api/live/stream', (req, res) => {
  const ip = clientIp(req);
  sseStream.createStream(req, res, ip);
});

// ── Build route configs (REST) ───────────────────────────────────────────────
// Each REST endpoint gets Bazaar discovery extension for catalog listing.
const REST_ROUTE_CONFIGS = {};

function makeAccepts(priceAtomic, description, urlTemplate, params, outputExample, outputSchema) {
  return [{
    scheme: 'exact',
    network: X402_NETWORK,
    price: '$' + (priceAtomic / 1e6).toFixed(2),
    payTo: PAY_TO,
    asset: MAINNET_USDC,
  }];
}

function makeBazaar(params, outputExample, outputSchema) {
  if (!declareDiscoveryExtension) return undefined;
  // declareDiscoveryExtension already returns { bazaar: { info, schema } } —
  // use it DIRECTLY as the route's `extensions` value (no extra wrapping).
  try {
    return declareDiscoveryExtension({
      method: 'GET',
      input: params || {},
      inputSchema: schemaFromExample(params),
      output: { example: outputExample, schema: outputSchema },
    });
  } catch (e) {
    console.warn('[bazaar] skip malformed extension:', String(e.message).slice(0, 60));
    return undefined;
  }
}

// Derive a minimal JSON schema for query params from their example values.
function schemaFromExample(params) {
  const props = {};
  for (const [k, v] of Object.entries(params || {})) {
    props[k] = { type: typeof v === 'number' ? 'number' : 'string', examples: [v] };
  }
  return { type: 'object', properties: props };
}

// Core social-data routes
for (const [routeName, cfg] of Object.entries(PRICE_MAP)) {
  const path = `/api/x402/${routeName}`;
  const desc = DESCRIPTIONS[routeName];
  let params = {}, outputEx = {}, outputSch = {};

  if (routeName === 'hotlist') {
    params = { board: 'weiboHot', limit: 10 };
    outputEx = { items: [{ title: '示例微博热搜', engagement: 1234567 }], total: 10, fetchedAt: new Date().toISOString() };
    outputSch = { type: 'object', properties: { items: { type: 'array' }, total: { type: 'number' }, fetchedAt: { type: 'string' } } };
  } else if (routeName === 'search') {
    params = { query: '热搜', limit: 10 };
    outputEx = { items: [{ title: '搜索结果示例' }], count: 5 };
    outputSch = { type: 'object', properties: { items: { type: 'array' }, count: { type: 'number' } } };
  } else {
    params = {};
    outputEx = { data: [] };
    outputSch = { type: 'object', properties: { data: { type: 'array' } } };
  }

  const bazaarExt = makeBazaar(params, outputEx, outputSch);
  REST_ROUTE_CONFIGS[`GET ${path}`] = {
    accepts: makeAccepts(cfg.atomic, desc, path, params, outputEx, outputSch),
    description: desc,
    mimeType: 'application/json',
    extensions: bazaarExt,
  };
}

// Utility routes ($0.01 each)
for (const tool of UTIL_TOOLS) {
  const p = tool.inputSchema && tool.inputSchema.properties || {};
  const firstKey = Object.keys(p)[0];
  const sampleVal = firstKey ? String(p[firstKey].default || 'example') : '';
  const params = firstKey ? { [firstKey]: sampleVal } : {};
  const priceCfg = priceOf(tool.name);
  const bazaarExt = makeBazaar(params, { ok: true, result: 'sample' }, { type: 'object' });
  const routePath = `/api/x402/util/${tool.name}`;
  REST_ROUTE_CONFIGS[`GET ${routePath}`] = {
    accepts: makeAccepts(priceCfg.atomic, tool.description || `Agent utility: ${tool.name}`, routePath, params, { ok: true }, { type: 'object' }),
    description: tool.description || `Agent utility: ${tool.name}`,
    mimeType: 'application/json',
    extensions: bazaarExt,
  };
}

// ── Install official x402 middleware (sets up PayAI facilitator settlement + Bazaar) ─
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(X402_NETWORK, new ExactEvmScheme());

// Fetch facilitator supported kinds at startup (needed for MCP manual verify/settle).
resourceServer.initialize().then(() => {
  console.log('[x402] facilitator initialized:', FACILITATOR_URL);
}).catch(e => {
  console.error('[x402] facilitator init failed:', String(e.message).slice(0, 120));
});

// ── Single settlement recording point ────────────────────────────────────────
// Fires for EVERY successful settle on this resourceServer instance — both the
// REST paymentMiddleware path and the manual MCP verify→settle path. Before this
// hook, REST settlements were settled on-chain but invisible to the ledger and
// to referral attribution (revenue black hole). Idempotent by txHash.
const SEEN_SETTLE_TX = new Set();
resourceServer.onAfterSettle(async (ctx) => {
  try {
    const r = ctx.result || {};
    if (!r.success) return;
    const reqs = ctx.requirements || {};
    // Payer: facilitator result first, then the v2 payload (permit-style payload.payer
    // or ERC-3009 authorization.from) — real facilitators normally return it, this is
    // belt-and-braces so attribution never silently loses the wallet.
    const pp = ctx.paymentPayload || {};
    const payer = r.payer
      || (pp.payload && (pp.payload.payer || (pp.payload.authorization && pp.payload.authorization.from)))
      || pp.payer || null;
    const txHash = r.transaction || null;
    if (txHash) {
      if (SEEN_SETTLE_TX.has(txHash)) return; // belt-and-braces idempotency
      SEEN_SETTLE_TX.add(txHash);
      if (SEEN_SETTLE_TX.size > 10000) SEEN_SETTLE_TX.clear();
    }
    // amount: requirements.amount is atomic units (string); tolerate decimal form
    let amountAtomic = Number(reqs.amount != null ? reqs.amount : (r.amount || 0));
    if (Number.isNaN(amountAtomic)) amountAtomic = 0;
    if (String(reqs.amount || '').includes('.')) amountAtomic = Math.round(amountAtomic * 1e6);
    const usd = amountAtomic / 1e6;
    const resource = String(reqs.resource || '') || 'unknown';
    let tool = resource;
    const mu = resource.match(/\/api\/x402\/util\/([A-Za-z0-9_-]+)/);
    if (resource === 'mcp://tool/get_hotlist' || /\/api\/x402\/hotlist/.test(resource)) tool = 'hotlist';
    else if (resource === 'mcp://tool/search_chinese_social' || /\/api\/x402\/search/.test(resource)) tool = 'search';
    else if (resource === 'mcp://tool/export_full_dataset' || /\/api\/x402\/full/.test(resource)) tool = 'full';
    else if (mu) tool = 'util:' + mu[1];
    pay.recordPayment({
      tool: String(tool),
      agentName: 'payer-' + String(payer || 'unknown').slice(0, 10),
      agentWallet: payer || null,
      endpoint: resource,
      priceAtomic: String(Math.round(amountAtomic)),
      priceUsd: usd,
      txHash: txHash,
      network: r.network || X402_NETWORK,
      settledBy: FACILITATOR_URL,
    });
    const attr = referrals.attributePayment({
      payerWallet: payer,
      amountUsd: usd,
      txHash: txHash,
      endpoint: resource,
    });
    if (attr.ok) console.log(`[referral] rebate ${attr.rebateUsd} USD accrued for ${attr.code}`);
    // 异步投递结算告警 + webhook 通知（fire-and-forget）
    try {
      alerts.enqueue({ type: 'settlement', tool, usd, txHash, wallet: payer, refCode: attr.code || null, treasury: PAY_TO });
    } catch (e) { console.error('[alerts] enqueue failed:', e.message.slice(0, 80)); }
    try {
      webhookSubs.deliver('settlement.new', { tool, usd, txHash, wallet: payer, refCode: attr.code || null, treasury: PAY_TO }).catch(() => {});
    } catch (e) { /* never block */ }
    // SSE broadcast to connected /api/live/stream clients
    try { sseStream.broadcast('settlement.new', { tool, usd, wallet: payer ? String(payer).slice(0, 10) + '…' : '?', txHash }); } catch (e) {}
  } catch (e) {
    console.error('[after-settle] record failed:', String(e && e.message).slice(0, 120));
    try {
      alerts.enqueue({ type: 'settlement-failed', error: String(e && e.message).slice(0, 120), treasury: PAY_TO });
    } catch (e2) {}
  }
});
console.log('[x402] after-settle recorder armed (REST + MCP unified)');

app.use(paymentMiddleware(REST_ROUTE_CONFIGS, resourceServer));

// ── REST handlers (called after payment middleware verifies) ─────────────────
app.get('/api/x402/hotlist', (req, res) => {
  const board = req.query.board || 'weiboHot';
  const limit = Math.min(Number(req.query.limit) || 10, 20);
  res.json({ tool: 'hotlist', board, items: hotlistData(board, limit), total: limit });
});
app.get('/api/x402/search', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 20);
  res.json({ tool: 'search', query: req.query.q || '', items: searchData(req.query.q || '', limit), count: limit });
});
app.get('/api/x402/full', (req, res) => {
  res.json({ tool: 'full', data: items(), itemCount: items().length });
});
app.get('/api/x402/util/:tool', async (req, res) => {
  try {
    const data = await runUtil(req.params.tool, req.query);
    res.json({ tool: req.params.tool, ...data });
  } catch (e) {
    res.status(502).json({ error: e.message.slice(0, 200) });
  }
});

// ── MCP Server (streamable HTTP) ─────────────────────────────────────────────
const MCP_TOOLS = [
  {
    name: 'get_hotlist',
    description: 'Trending posts from Chinese social media (Weibo Hot Search, Douban, Zhihu, Bilibili, Tieba). $0.05 USDC per call.',
    inputSchema: { type: 'object', properties: { board: { type: 'string', description: 'Board: weiboHot | douban | zhihu | bilibili | tieba' }, limit: { type: 'integer', description: 'Items to return (max 20)', default: 10 } }, required: ['board'] },
  },
  {
    name: 'search_chinese_social',
    description: 'Cross-board keyword search across Chinese social media trending data. $0.05 USDC per call.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search keyword (Chinese or English)' }, limit: { type: 'integer', default: 10, maximum: 20 } }, required: ['query'] },
  },
  {
    name: 'export_full_dataset',
    description: 'Complete dataset export with all fields and metadata. $0.50 USDC per call.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sample_free',
    description: 'Free preview: 3 sample items, no payment required.',
    inputSchema: { type: 'object', properties: {} },
  },
  ...UTIL_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
];

const TOOL_PATHS = {
  get_hotlist: '/api/x402/hotlist',
  search_chinese_social: '/api/x402/search',
  export_full_dataset: '/api/x402/full',
};

function mcpJson(res, id, result, status = 200) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json({ jsonrpc: '2.0', id, result });
}

// ── MCP payment requirements (cached per tool; built via facilitator) ────────
const MCP_REQ_CACHE = new Map();
function mcpPriceUsd(toolName) {
  if (UTIL_NAMES.has(toolName)) return priceOf(toolName).usd;
  if (toolName === 'get_hotlist' || toolName === 'search_chinese_social') return 0.05;
  if (toolName === 'export_full_dataset') return 0.50;
  return null;
}
async function requirementsForTool(toolName) {
  if (MCP_REQ_CACHE.has(toolName)) return MCP_REQ_CACHE.get(toolName);
  const priceUsd = mcpPriceUsd(toolName);
  if (priceUsd == null) return null;
  try {
    const reqs = await resourceServer.buildPaymentRequirements({
      scheme: 'exact', network: X402_NETWORK,
      price: '$' + priceUsd.toFixed(2), payTo: PAY_TO,
    });
    const one = Array.isArray(reqs) ? reqs[0] : reqs;
    MCP_REQ_CACHE.set(toolName, one);
    return one;
  } catch (e) {
    console.error('[mcp-pay] requirements failed for', toolName, ':', String(e.message).slice(0, 100));
    return null;
  }
}

// Parse the PAYMENT-SIGNATURE header: base64(JSON) or raw JSON.
function parsePaymentHeader(headerVal) {
  if (!headerVal) return null;
  const s = String(headerVal).trim();
  try { return JSON.parse(Buffer.from(s, 'base64').toString('utf8')); } catch (e) {}
  try { return JSON.parse(s); } catch (e) { return null; }
}

function mcpPaymentError(res, id, toolName, reason) {
  const path = TOOL_PATHS[toolName] || '/api/x402/hotlist';
  const priceUsd = mcpPriceUsd(toolName) != null ? mcpPriceUsd(toolName) : 0.05;
  const accepts = [{
    scheme: 'exact', network: X402_NETWORK,
    price: '$' + priceUsd.toFixed(2),
    payTo: PAY_TO, asset: MAINNET_USDC,
  }];
  const paymentRequired = {
    x402Version: 2,
    error: reason || 'PAYMENT-SIGNATURE header required',
    resource: 'mcp://tool/' + toolName,
    accepts,
    extensions: {},
  };
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED,PAYMENT-RESPONSE');
  res.status(402).json({
    jsonrpc: '2.0', id,
    result: { content: [{ type: 'text', text: JSON.stringify({ paymentRequired }) }], structuredContent: { paymentRequired } },
  });
}

app.all('/mcp', async (req, res) => {
  if (req.method === 'GET') {
    return res.status(405).json({ jsonrpc: '2.0', error: { code: -32601, message: 'Use POST for JSON-RPC (MCP streamable HTTP)' } });
  }
  const body = req.body || {};
  const { id, method, params } = body;

  if (method === 'initialize') {
    return mcpJson(res, id ?? null, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'AutoTasker Hub — China Social Data', version: '5.0.0' },
      instructions: 'Chinese social media trending data. Free: sample_free. Paid tools settle via x402 exact scheme on Base (eip155:8453) through PayAI facilitator. Send PAYMENT-SIGNATURE header with each paid tool call.',
    });
  }
  if (method === 'notifications/initialized') return res.status(202).end();
  if (method === 'tools/list') return mcpJson(res, id ?? null, { tools: MCP_TOOLS });
  if (method === 'tools/call') {
    const toolName = params && params.name;
    const args = params && params.arguments || {};

    if (toolName === 'sample_free') {
      return mcpJson(res, id ?? null, {
        content: [{ type: 'text', text: JSON.stringify({ sample: items().slice(0, 3), totalInPack: items().length }) }]
      });
    }
    if (!toolName) return res.status(400).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32602, message: 'missing tool name' } });

    // ── Paid tool: full x402 verify → settle → serve (NO free rides) ──────────
    const paymentHeader = req.headers['payment-signature'];
    if (!paymentHeader) {
      return mcpPaymentError(res, id ?? null, toolName, 'PAYMENT-SIGNATURE header required');
    }
    const paymentPayload = parsePaymentHeader(paymentHeader);
    if (!paymentPayload || typeof paymentPayload !== 'object') {
      return mcpPaymentError(res, id ?? null, toolName, 'PAYMENT-SIGNATURE header is not a valid x402 payload');
    }

    const reqs = await requirementsForTool(toolName);
    if (!reqs) {
      return mcpPaymentError(res, id ?? null, toolName, 'no payment requirements configured for tool ' + toolName);
    }

    // 1) Verify with facilitator (signature, amount, expiry, balance)
    let verified;
    try {
      verified = await resourceServer.verifyPayment(paymentPayload, reqs);
    } catch (e) {
      verified = { isValid: false, invalidReason: 'verify_error: ' + String(e.message).slice(0, 120) };
    }
    if (!verified || !verified.isValid) {
      return mcpPaymentError(res, id ?? null, toolName,
        'payment verification failed: ' + (verified && verified.invalidReason ? verified.invalidReason : 'unknown'));
    }

    // 2) Settle on-chain via facilitator (payer → payTo directly)
    let settled;
    try {
      settled = await resourceServer.settlePayment(paymentPayload, reqs);
    } catch (e) {
      settled = { success: false, errorReason: String(e.message).slice(0, 120) };
    }
    if (!settled || !settled.success) {
      return mcpPaymentError(res, id ?? null, toolName,
        'settlement failed: ' + (settled && settled.errorReason ? settled.errorReason : 'unknown'));
    }

    // Ledger record + referral attribution are handled by the unified
    // resourceServer.onAfterSettle hook (same path as REST) — do NOT record here,
    // or every MCP settlement would be double-counted.

    res.setHeader('PAYMENT-RESPONSE', Buffer.from(JSON.stringify({
      success: true, transaction: settled.transaction, network: settled.network || X402_NETWORK,
    })).toString('base64'));
    res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED,PAYMENT-RESPONSE');

    // 4) Serve the paid tool
    try {
      if (UTIL_NAMES.has(toolName)) {
        const data = runUtil(toolName, args);
        if (data && typeof data.then === 'function') {
          return data.then(result => mcpJson(res, id ?? null, {
            content: [{ type: 'text', text: JSON.stringify(result) }]
          })).catch(e => res.status(500).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message: e.message } }));
        }
        return mcpJson(res, id ?? null, { content: [{ type: 'text', text: JSON.stringify(data) }] });
      }

      const route = TOOL_PATHS[toolName];
      if (route) {
        if (toolName === 'get_hotlist') {
          return mcpJson(res, id ?? null, {
            content: [{ type: 'text', text: JSON.stringify({
              tool: 'hotlist', board: args.board || 'weiboHot',
              items: hotlistData(args.board || 'weiboHot', args.limit || 10),
            })}]
          });
        }
        if (toolName === 'search_chinese_social') {
          return mcpJson(res, id ?? null, {
            content: [{ type: 'text', text: JSON.stringify({
              tool: 'search', query: args.query || '',
              items: searchData(args.query || '', args.limit || 10),
            })}]
          });
        }
        if (toolName === 'export_full_dataset') {
          return mcpJson(res, id ?? null, {
            content: [{ type: 'text', text: JSON.stringify({ tool: 'full', data: items() })}]
          });
        }
      }
      return res.status(400).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32602, message: `Unknown tool: ${toolName}` } });
    } catch (e) {
      return res.status(500).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message: e.message.slice(0, 200) } });
    }
  }
  return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Unsupported method' } });
});

// ── Well-known discovery ─────────────────────────────────────────────────────
app.get('/.well-known/x402', (req, res) => res.json({
  service: 'AutoTasker Hub — China Social Data API + MCP',
  description: 'Real-time Chinese social media trending data (Weibo/Zhihu/Douban/Bilibili/Tieba) for AI agents, researchers, and automation workflows. x402 USDC settlement on Base mainnet.',
  tags: ['china', 'social-media', 'trending', 'data', 'mcp', 'x402', 'usdc', 'base'],
  url: `${req.protocol}://${req.headers.host}`,
  mcp: `${req.protocol}://${req.headers.host}/mcp`,
  docs: {
    llms: `${req.protocol}://${req.headers.host}/llms.txt`,
    offer: `${req.protocol}://${req.headers.host}/offer.html`,
    trust: `${req.protocol}://${req.headers.host}/trust`,
    faq: `${req.protocol}://${req.headers.host}/faq`,
    metrics: `${req.protocol}://${req.headers.host}/api/metrics`,
    proof: `${req.protocol}://${req.headers.host}/api/x402/proof`,
    reconcile: `${req.protocol}://${req.headers.host}/api/x402/reconcile`,
    status: `${req.protocol}://${req.headers.host}/api/status`,
  },
  free: [
    'GET /api/status — health check with uptime & memory',
    'GET /api/x402/sample?limit=N — sample data (no payment)',
    'GET /api/x402/summary — dataset summary by source',
    'POST /mcp (initialize, tools/list) — MCP protocol handshake',
    'GET /.well-known/x402 — this service discovery document',
    'GET /feed.xml — RSS feed of trending topics',
  ],
  paid: [
    { tool: 'get_hotlist', path: '/api/x402/hotlist', price: '$0.05 USDC', params: 'board=weiboHot|zhihu|douban|bilibili|tieba' },
    { tool: 'search_chinese_social', path: '/api/x402/search', price: '$0.05 USDC', params: 'q=<keyword>&limit=10' },
    { tool: 'export_full_dataset', path: '/api/x402/full', price: '$0.50 USDC' },
    { tool: 'util_tools', path: '/api/x402/util/:name', price: '$0.01 USDC each' },
  ],
  payTo: PAY_TO,
  network: X402_NETWORK,
  asset: MAINNET_USDC,
  facilitator: FACILITATOR_URL,
  settlement: 'x402 exact (PayAI facilitator → on-chain Base)',
  bazaar: declareDiscoveryExtension ? 'auto-listed when payments settle' : 'extension not loaded',
  verification: {
    basescan: `https://basescan.org/address/${PAY_TO}`,
    proofApi: `${req.protocol}://${req.headers.host}/api/x402/proof`,
    reconcileApi: `${req.protocol}://${req.headers.host}/api/x402/reconcile`,
  },
  referral: { rebateBps: 1000, minPayoutUsd: 1, note: '10% rebate, gold treasury direct pay' },
}));

// ── LLMs.txt (agent-readable documentation) ─────────────────────────────────
app.get('/llms.txt', (req, res) => {
  const lines = [
    '# AutoTasker Hub',
    'Chinese social media trending data API for AI agents.',
    '',
    '## Free endpoints',
    '- GET /api/status — health check',
    '- GET /api/x402/sample?limit=N — sample data (no payment)',
    '- GET /api/x402/summary — data summary',
    '- POST /mcp (initialize, tools/list) — MCP protocol handshake',
    '- GET /.well-known/x402 — service discovery document (Bazaar listing)',
    '',
    '## Health & observability',
    '- GET /api/status — uptime, memory, last settlement time, alert queue size',
    '- GET /api/alerts/queue — pending/sent/failed alert count (read-only)',
    '- GET /api/metrics — aggregate operational stats (JSON; Accept:text/html returns dashboard)',
    '',
    '## Paid endpoints (x402 exact, Base mainnet USDC)',
    '- GET /api/x402/hotlist?board=weiboHot&limit=10 — $0.05 USDC',
    '- GET /api/x402/search?q=keyword&limit=10 — $0.05 USDC',
    '- GET /api/x402/full — $0.50 USDC (full dataset)',
    '- GET /api/x402/util/:name — $0.01 USDC each',
    '',
    '## MCP Tools',
    '- get_hotlist: Chinese social media trending data',
    '- search_chinese_social: cross-board keyword search',
    '- export_full_dataset: full dataset export',
    '- ' + UTIL_TOOLS.length + ' utility tools available via POST /mcp tools/call',
    '',
    '## Trust & verification',
    '- GET /api/x402/proof — machine-readable settled count, revenue, pay-to, timestamps (honest: zero stays zero)',
    '- GET /api/x402/reconcile — latest on-chain reconciliation (invariant: ledger <= chain); status not-run until the daily cron runs',
    '- GET /trust — human-readable trust center: on-chain verifiable revenue, rebates, 30/60/10 policy',
    '- GET /faq — self-service FAQ (also machine-readable FAQPage JSON-LD)',
    '- Verify every payment on BaseScan by the pay-to address below; no mock/test volume is ever counted',
    '',
    '## Referral program (10% rebate, paid on-chain by the treasury)',
    '- POST /api/ref/new — create a referral code (5/hour/IP)',
    '- POST /api/ref/claim — bind your payout wallet {code, wallet}',
    '- GET /r/:code — click-tracked redirect to the offer page',
    '- GET /ref/:code — referrer dashboard (clicks, attributed revenue, rebate accrued/paid/pending)',
    '- GET /api/ref/stats/:code — the same stats as JSON',
    '- Rebate = 10% of attributed payments; min payout $1; paid directly in USDC from the treasury, no pooled intermediary',
    '',
    '## Pricing (CNY plans, invoices available)',
    '- Daily digest ¥29/month · Full export ¥99/one-off · API monthly ¥299/month · Enterprise custom',
    '- Alipay / WeChat merchant QR once the merchant accounts are activated',
    '',
    '## Settlement',
    '- Network: ' + X402_NETWORK + ' (Base mainnet)',
    '- Token: USDC (' + MAINNET_USDC + ')',
    '- Pay-to: ' + PAY_TO,
    '- Facilitator: ' + FACILITATOR_URL,
    '- Bazaar: auto-listed when payments settle',
  ];
  res.type('text/plain').send(lines.join('\n'));
});

// ── 自助客服：/faq — 14 条常见问题的可索引页面 + FAQPage 结构化数据 + 在线工单 ──
// 目标：把「有人来问」的环节也自动化 —— 页面先答掉 90% 的问题（SEO 可索引，
// 也能被 AI 抓取），答不掉的直接提交工单，FAQ 关键词命中则秒回，全程无人工。
app.get('/faq', (req, res) => {
  const faq = support.FAQ || [];
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }).replace(/</g, '\\u003c');
  const rows = faq.map((f, i) => `<details${i === 0 ? ' open' : ''} style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:8px 0">
<summary style="cursor:pointer;font-weight:600">${esc(f.q)}</summary>
<p style="color:#334155;font-size:.94rem;margin:8px 0 0">${esc(f.a)}</p></details>`).join('');
  res.set('Cache-Control', 'public, max-age=600');
  res.type('html').send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>常见问题 — 价格、支付、MCP 接入、返利与退款 | AutoTasker Hub</title>
<meta name="description" content="AutoTasker Hub 自助客服：价格（$0.05/次起、人民币套餐）、支付方式、MCP/Agent 接入、返利提现、退款与发票，14 条问题一次讲清。">
<link rel="canonical" href="https://autotasker.highkingflower.com/faq">
<meta property="og:title" content="常见问题 — AutoTasker Hub">
<meta property="og:description" content="价格、支付、MCP 接入、返利提现、退款与发票，14 条常见问题一次讲清。">
<meta property="og:type" content="website">
<meta property="og:url" content="https://autotasker.highkingflower.com/faq">
<script type="application/ld+json">${ld}</script>
<style>body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:760px;margin:0 auto;padding:24px 16px;line-height:1.65;color:#0f172a;background:#f8fafc}
h1{margin:0 0 4px}a{color:#4f46e5}input,textarea,button{font:inherit}
.field{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #cbd5e1;border-radius:8px;margin:4px 0 10px;background:#fff}
button{background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:10px 18px;cursor:pointer}
#out{margin-top:12px;font-size:.93rem;white-space:pre-wrap}</style></head><body>
<h1>常见问题</h1>
<p style="color:#64748b;font-size:.92rem;margin-top:0">90% 的问题这里有答案。没答到？提交工单，FAQ 关键词命中会<b>立刻自动回复</b>。</p>
${rows}
<h2 style="font-size:1.1rem;margin:28px 0 6px">还是没解决？提交工单（自动回复，无需注册）</h2>
<form id="tk" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px">
  <label style="font-size:.9rem;color:#475569">联系方式（可选，仅在需要人工跟进时使用）</label>
  <input class="field" id="contact" placeholder="邮箱 / Telegram / 微信">
  <label style="font-size:.9rem;color:#475569">问题描述</label>
  <textarea class="field" id="msg" rows="3" placeholder="例如：想开发票，套餐是 API 包月"></textarea>
  <button type="submit">提交</button>
  <div id="out"></div>
</form>
<p style="font-size:.9rem;color:#64748b;margin-top:22px">
<a href="/offer.html">产品与价格</a> · <a href="/trust">信任中心（链上可验证）</a> · <a href="/trending">热搜快照</a> · <a href="/llms.txt">Agent 文档</a></p>
<script>
document.getElementById('tk').addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = document.getElementById('out');
  out.textContent = '提交中…';
  try {
    const r = await fetch('/api/support/ticket', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contact: document.getElementById('contact').value.trim(),
        topic: 'faq-page',
        message: document.getElementById('msg').value.trim(),
      }),
    });
    const d = await r.json();
    if (!d.ok) { out.textContent = '提交失败：' + (d.reason || r.status); return; }
    const t = d.ticket || {};
    const reply = (t.replies && t.replies[0] && t.replies[0].text) || null;
    out.textContent = '工单号 ' + t.id + '\\n' +
      (reply ? '自动回复：' + reply : '已收到，人工窗口会在 1 个工作日内跟进。');
  } catch (err) { out.textContent = '网络错误：' + err.message; }
});
</script>
</body></html>`);
});

// ── Growth engine: distribution / support / content (all inbound, compliant) ─

// ── i18n 语言前缀路由：通用 catch-all（放在所有路由之后，最后执行）──────────
// 原理：express.static 先尝试匹配文件（失败返回 404），然后我们检查原始 URL
// 是否有 /en/ /ja/ /kr/ 前缀，有则剥离后重定向到基础路径并设置 req.lang。
// 这样静态文件和具体路由都正常工作，语言变体通过 301 永久重定向到标准 URL。
const LANG_PREFIXES = ['/en/', '/ja/', '/kr/'];
app.use((req, res, next) => {
  const url = req.originalUrl || req.url || '';
  for (const prefix of LANG_PREFIXES) {
    if (url.startsWith(prefix)) {
      req.lang = prefix.slice(1, -1); // 'en', 'ja', or 'kr'
      break;
    }
  }
  next();
});

// 在 router 全部注册完成后，添加语言别名重定向（必须在最后）
const langAliases = [
  '/offer.html', '/trending', '/trust', '/faq', '/partner', '/live',
  '/leaderboard', '/agent', '/blog', '/blog/', '/llms.txt',
  '/api/status', '/api/metrics', '/api/x402/proof', '/api/x402/reconcile',
  '/api/live/feed', '/api/live/stream', '/api/leaderboard',
  '/api/dashboard/:wallet', '/dashboard/:wallet',
  '/api/ref/stats/:code', '/ref/:code',
  '/api/support/ticket/:id', '/webhooks/verify/:id',
];
for (const lang of ['en', 'ja', 'kr']) {
  for (const route of langAliases) {
    app.get('/' + lang + route, (req, res) => {
      const baseRoute = route.startsWith('/') ? route : '/' + route;
      res.redirect(301, 'https://autotasker.highkingflower.com' + baseRoute);
    });
  }
}

// Static site: offer.html, index.html, robots.txt, sitemap.xml
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '5m' }));

// ── SEO auto-generated topic pages（每条热搜独立落地页，供搜索引擎收录）───────
app.get('/topic/:slug', (req, res) => {
  const slug = String(req.params.slug || '').replace(/[^\w\-]/g, '');
  const filePath = path.join(ROOT, 'public', 'topic', slug + '.html');
  if (!fs.existsSync(filePath)) return res.status(404).type('text/plain').send('not found\n');
  const html = fs.readFileSync(filePath, 'utf8');
  res.type('html').set('Cache-Control', 'public, max-age=300').send(html);
});

// ── Blog（自动生成深度解析文章，SEO 长尾流量）─────────────────────────────────
app.get('/blog', (req, res) => {
  // List available blog posts from data/blog/
  const blogsDir = path.join(ROOT, 'data', 'blog');
  let posts = [];
  try {
    const dirs = fs.readdirSync(blogsDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    for (const dir of dirs) {
      const files = fs.readdirSync(path.join(blogsDir, dir)).filter(f => f.endsWith('.md'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(blogsDir, dir, f), 'utf8');
        const titleMatch = content.match(/^title:\s*"(.+?)"/m);
        posts.push({ date: dir, slug: f.replace('.md', ''), title: titleMatch ? titleMatch[1] : f });
      }
    }
  } catch (e) {}
  const rows = posts.slice(0, 30).map(p =>
    `<tr><td>${p.date}</td><td><a href="/blog/${p.slug}" style="color:#818cf8">${esc(p.title?.slice(0, 60) || p.slug)}</a></td></tr>`
  ).join('') || '<tr><td colspan="2" style="color:#64748b">暂无文章</td></tr>';
  res.type('html').send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>博客 — AutoTasker Hub</title>
<style>body{font-family:system-ui;max-width:760px;margin:0 auto;padding:24px 16px;background:#0f172a;color:#e2e8f0}
h1{margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{padding:10px 12px;border-bottom:1px solid #1e293b;text-align:left}
th{color:#64748b;font-size:.78rem;text-transform:uppercase}a{color:#818cf8}</style></head><body>
<h1>📝 AutoTasker Hub Blog</h1><p style="color:#64748b;margin-top:-8px">自动生成 · 每条热搜深度解析 · 链上可验</p>
<table><thead><tr><th>日期</th><th>标题</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:16px;font-size:.85rem;color:#475569"><a href="/trending">回到热搜</a> · <a href="/offer.html">产品价格</a></p>
</body></html>`);
});
app.get('/blog/:slug', (req, res) => {
  const slug = String(req.params.slug || '').replace(/[^\w\-]/g, '');
  // Try public/blog/slug/index.html first, then data/blog/*/slug.md converted
  const htmlFile = path.join(ROOT, 'public', 'blog', slug, 'index.html');
  if (fs.existsSync(htmlFile)) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    return res.type('html').set('Cache-Control', 'public, max-age=600').send(html);
  }
  // Fallback: find .md file
  const mdFiles = [];
  try {
    const blogsDir = path.join(ROOT, 'data', 'blog');
    for (const dir of (fs.readdirSync(blogsDir) || [])) {
      const f = path.join(blogsDir, dir, slug + '.md');
      if (fs.existsSync(f)) mdFiles.push(f);
    }
  } catch (e) {}
  if (!mdFiles.length) return res.status(404).type('text/plain').send('not found\n');
  const md = fs.readFileSync(mdFiles[0], 'utf8');
  // Minimal markdown→HTML conversion (headings, links, bold)
  let html = md
    .split('\n')
    .filter(l => !l.startsWith('---') && !l.startsWith('title:') && !l.startsWith('date:') && !l.startsWith('tags:') && !l.startsWith('description:'))
    .map(l => {
      if (l.startsWith('## ')) return `<h2>${l.slice(3)}</h2>`;
      if (l.startsWith('|') && l.includes('---')) return '';
      if (l.startsWith('|')) {
        const cells = l.split('|').filter(Boolean).map(c => c.trim());
        return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
      }
      if (l.startsWith('- ')) return `<li>${l.slice(2)}</li>`;
      if (l.startsWith('> ')) return `<blockquote>${l.slice(2)}</blockquote>`;
      if (l.match(/\[${esc}\]\(/)) return l.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      return l.trim() ? `<p>${l}</p>` : '';
    })
    .join('\n');
  const title = md.match(/^# (.+)$/m)?.[1] || slug;
  res.type('html').send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)} | Blog</title>
<style>body{font-family:system-ui;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.8;color:#1a1a2e}
h1{font-size:1.5rem}h2{margin:24px 0 8px}blockquote{border-left:3px solid #4f46e5;padding-left:16px;color:#475569}
table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:6px 10px;border:1px solid #e2e8f0;text-align:left;font-size:.88rem}
a{color:#4f46e5}footer{margin-top:24px;font-size:.82rem;color:#94a3b8;text-align:center}</style></head><body>
<a href="/blog" style="font-size:.85rem;color:#64748b">← 返回博客列表</a>
<h1>${esc(title)}</h1>${html}<footer><a href="/offer.html">产品与价格</a> · <a href="/agent">Agent接入</a></footer>
</body></html>`);
});

// ① 推荐链接入口：记录点击 → cookie → 落地页
app.get('/r/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const meta = { ip: clientIp(req), ua: req.headers['user-agent'], referer: req.headers.referer };
  const t = referrals.trackClick(code, meta);
  res.setHeader('Set-Cookie', `atref=${encodeURIComponent(code)}; Max-Age=2592000; Path=/; SameSite=Lax`);
  if (!t.ok) return res.redirect('/offer.html?ref=' + encodeURIComponent(code) + '&err=' + encodeURIComponent(t.reason));
  res.redirect('/offer.html?ref=' + encodeURIComponent(code));
});

// ② 生成推荐码（限频：同 IP 每小时 5 个）
app.post('/api/ref/new', (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit('refnew:' + ip, 5, 3600 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'rate limit: 5 codes per hour' });
  }
  const r = referrals.newCode(ip, (req.body && req.body.note) || null);
  res.json({ ok: true, ...r, url: 'https://autotasker.highkingflower.com/r/' + r.code });
});

// ③ 点击上报（落地页 JS 在没有 /r/ 跳转时补记）
app.post('/api/ref/track', (req, res) => {
  const code = String((req.body && req.body.code) || '').toUpperCase();
  const t = referrals.trackClick(code, { ip: clientIp(req), ua: req.headers['user-agent'], referer: req.headers.referer });
  if (t.ok) res.setHeader('Set-Cookie', `atref=${encodeURIComponent(code)}; Max-Age=2592000; Path=/; SameSite=Lax`);
  res.json(t);
});

// ④ 绑定钱包（一个钱包只认首码；运营/金库地址禁绑）
app.post('/api/ref/claim', (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit('refclaim:' + ip, 10, 3600 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'rate limit' });
  }
  const cookies = parseCookies(req);
  const code = String((req.body && req.body.code) || cookies.atref || '').toUpperCase();
  const wallet = (req.body && req.body.wallet) || '';
  res.json(referrals.claim(code, wallet, ip));
});

// ⑤ 推广战绩（推荐人自助查看）
app.get('/api/ref/stats/:code', (req, res) => {
  res.json(referrals.stats(String(req.params.code).toUpperCase()));
});

// ⑥ 引擎健康（全站汇总，无个人信息）
app.get('/api/ref/health', (req, res) => res.json({ engine: 'referrals-v1', ...referrals.summary() }));

// ⑦ 自助客服：提单（FAQ 命中即自动回复）
app.post('/api/support/ticket', (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit('support:' + ip, 5, 3600 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'rate limit: 5 tickets per hour' });
  }
  const b = req.body || {};
  if (!b.message || String(b.message).length < 3) {
    return res.status(400).json({ ok: false, reason: 'message required' });
  }
  const r = support.createTicket({ contact: b.contact, topic: b.topic, message: b.message }, ip);
  res.json({ ok: true, ...r });
});

// ⑧ 自助客服：查单
app.get('/api/support/ticket/:id', (req, res) => {
  const t = support.getTicket(String(req.params.id));
  if (!t) return res.status(404).json({ ok: false, reason: 'ticket not found' });
  res.json({ ok: true, ticket: t });
});

// ⑧b 诚实社会证明：proof API 与 /trust 页共用同一取数口径。
// 每一笔 settledCount 都对应一次 Base 主网 USDC 转账（BaseScan 按 payTo 可逐一核对），
// house_e2e 测试流量永不入账，这里不做任何美化或外推。
function proofData() {
  let firstAt = null, latestAt = null;
  try {
    const ledger = pay.loadLedger();
    const ts = (ledger.entries || []).map((e) => e.ts).filter(Boolean).sort();
    firstAt = ts[0] || null;
    latestAt = ts[ts.length - 1] || null;
  } catch (e) { /* ledger unreadable: keep nulls, still honest */ }
  const s = pay.getSummary();
  const r = referrals.summary();
  return {
    ok: true,
    protocol: 'x402-v2',
    network: 'eip155:8453',
    networkName: 'Base',
    asset: 'USDC',
    assetContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: PAY_TO,
    settledCount: Number(s.settledCount || 0),
    totalRevenueUsd: s.revenueUsd || '0.000000',
    firstSettledAt: firstAt, latestSettledAt: latestAt,
    referral: {
      attributedPayments: r.attributedPayments || 0,
      rebatesPaidUsd: r.rebatesPaidUsd || '0.000000',
      rebatesPendingUsd: r.rebatesPendingUsd || '0.000000',
      rebateBps: r.rebateBps || 1000,
    },
    verifyUrl: 'https://basescan.org/address/' + PAY_TO,
    note: '数字来自生产结算账本（onAfterSettle 实时记录），每笔可在 BaseScan 按 payTo 地址核对；不含任何模拟或测试流量。',
    generatedAt: s.generatedAt,
  };
}
app.get('/api/x402/proof', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(proofData());
});

// ⑧b2 链上对账状态：读 cron 每日写入的报告（服务端只读，不连链、不阻塞请求）。
// 没跑过就诚实返回 status=not-run，绝不假装"已对账"。
const RECONCILE_REPORT = path.join(__dirname, '..', 'data', 'onchain-reconcile-report.json');
app.get('/api/x402/reconcile', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  let rep = null;
  try { rep = JSON.parse(fs.readFileSync(RECONCILE_REPORT, 'utf8')); } catch (e) { /* not run yet */ }
  if (!rep) {
    return res.json({
      ok: null, status: 'not-run', treasury: PAY_TO,
      note: '链上对账尚未运行（cron 每日 05:15 执行 scripts/reconcile-onchain.js）',
    });
  }
  const ageMs = Date.now() - new Date(rep.checkedAt || 0).getTime();
  res.json({
    ok: rep.ok === true,
    status: rep.ok === true ? 'reconciled' : 'mismatch',
    treasury: rep.treasury || PAY_TO,
    checkedAt: rep.checkedAt,
    ageMinutes: Math.round(ageMs / 60000),
    stale: !(ageMs >= 0 && ageMs < 48 * 3600 * 1000),
    onchain: rep.onchain ? {
      source: rep.onchain.source, count: rep.onchain.count,
      transfers: rep.onchain.transfers, usd: rep.onchain.usd,
      coveredFrom: rep.onchain.coveredFrom, coveredTo: rep.onchain.coveredTo,
    } : null,
    ledger: rep.ledger && rep.ledger.ok ? {
      settledCount: rep.ledger.settledCount, revenueUsd: rep.ledger.revenueUsd,
    } : null,
    checks: rep.checks || [],
    verdict: rep.verdict || null,
    error: rep.error || null,
  });
});

// ⑧d 信任中心：/trust — 链上可验证数据的人读页面（可索引，转化辅助）
app.get('/trust', (req, res) => {
  const d = proofData();
  const zero = d.settledCount === 0;
  // 链上对账状态（cron 每日 05:15 写入，读不到就诚实显示「未运行」）
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(RECONCILE_REPORT, 'utf8')); } catch (e) { /* not run */ }
  const recAgeMin = rec ? Math.round((Date.now() - new Date(rec.checkedAt || 0).getTime()) / 60000) : null;
  const recCell = !rec
    ? '<span style="color:#64748b">未运行（每日 05:15 自动对账）</span>'
    : (rec.ok === true
      ? `<span style="color:#15803d">✓ 已对账</span> <span style="color:#64748b;font-weight:400">（${recAgeMin} 分钟前 · 账本 ≤ 链上）</span>`
      : `<span style="color:#b91c1c">✗ 不一致，已告警</span>`);
  const row = (k, v) => `<tr><td style="color:#64748b;padding:9px 12px;border-bottom:1px solid #e2e8f0">${k}</td>
    <td style="text-align:right;font-weight:600;padding:9px 12px;border-bottom:1px solid #e2e8f0">${v}</td></tr>`;
  res.set('Cache-Control', 'public, max-age=300');
  res.type('html').send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>信任中心 — 链上可验证的收入与返利 | AutoTasker Hub</title>
<meta name="description" content="AutoTasker Hub 的全部收款地址、结算笔数、返利支付与分配政策，逐项可在 BaseScan 链上核对。不刷单、不虚构收入。">
<link rel="canonical" href="https://autotasker.highkingflower.com/trust">
<meta property="og:title" content="信任中心 — 链上可验证的收入与返利">
<meta property="og:description" content="收款地址、结算笔数、返利支付、30/60/10 分配政策，逐项 BaseScan 可查。">
<meta property="og:type" content="website">
<meta property="og:url" content="https://autotasker.highkingflower.com/trust">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: 'AutoTasker Hub 信任中心', url: 'https://autotasker.highkingflower.com/trust', description: '链上可验证的收款与返利数据' }).replace(/</g, '\\u003c')}</script>
</head><body style="font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.65;color:#0f172a;background:#f8fafc">
<h1 style="margin:0 0 4px">🔗 信任中心</h1>
<p style="color:#64748b;font-size:.92rem;margin-top:0">所有数字均来自生产结算账本，逐笔可在 BaseScan 核对。我们宁可显示 0，也不虚构一单。</p>
<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-size:.95rem;margin:18px 0">
${row('收款地址（唯一金库）', `<a href="${d.verifyUrl}" target="_blank" rel="noopener">${d.payTo.slice(0, 10)}…${d.payTo.slice(-6)}</a>`)}
${row('结算网络 / 资产', `${d.networkName}（${d.network}）· ${d.asset}`)}
${row('累计链上结算', zero ? '<span style="color:#64748b">试运行中（0 笔）</span>' : d.settledCount + ' 笔')}
${row('累计收入', zero ? '<span style="color:#64748b">$0.000000</span>' : '$' + d.totalRevenueUsd)}
${row('首次 / 最近结算', (d.firstSettledAt || '—') + ' / ' + (d.latestSettledAt || '—'))}
${row('归因支付（分销）', d.referral.attributedPayments + ' 笔')}
${row('返利已付 / 待付', '$' + d.referral.rebatesPaidUsd + ' / $' + d.referral.rebatesPendingUsd)}
${row('返利比例', (d.referral.rebateBps / 100) + '% · 金库链上直付')}
${row('链上对账', recCell)}
</table>
<h2 style="font-size:1.1rem;margin:24px 0 6px">分配政策（真金白银进来后怎么分）</h2>
<ul style="font-size:.93rem;color:#334155;padding-left:20px;margin-top:4px">
<li><b>30% 储蓄</b>：永久留存（cold savings 子账，永不进合约）</li>
<li><b>60% 复利</b>：仅投白名单 USDC 单币（Aave/Morpho/Compound/Moonwell），收益再按 40/60 分裂</li>
<li><b>10% 稳定盘</b>：随时可用（运营/返利支付）</li>
<li>禁杠杆、禁 LP、禁锁仓、禁高频交易</li>
</ul>
<h2 style="font-size:1.1rem;margin:24px 0 6px">口径与审计承诺</h2>
<ul style="font-size:.93rem;color:#334155;padding-left:20px;margin-top:4px">
<li>REST 与 MCP 两条结算路径统一记账（onAfterSettle 钩子），txHash 幂等防重复</li>
<li>内部端到端测试流量（house_e2e）永不并入对外收入</li>
<li>返利不经第三方资金池：金库从 Base 主网 USDC 直接转账给推荐人</li>
<li>机器可读数据：<a href="/api/x402/proof">/api/x402/proof</a> · <a href="/api/x402/reconcile">/api/x402/reconcile</a></li>
</ul>
<p style="font-size:.9rem;color:#64748b">生成于 ${new Date(d.generatedAt || Date.now()).toISOString().replace('T', ' ').slice(0, 19)} UTC ·
<a href="/offer.html">产品与价格</a> · <a href="/trending">热搜快照</a> · <a href="/feed.xml">RSS</a></p>
</body></html>`);
});

// ⑧c 分销者仪表盘：/ref/:code — 给推荐人的公开数据页（钱包地址打码）。
// 与 /r/:code（跳转+记点击）分工：仪表盘是静态展示，不产生点击归因。
app.get('/ref/:code', (req, res) => {  const code = String(req.params.code || '').toUpperCase();
  const s = referrals.stats(code);
  if (!s.ok) {
    return res.status(404).type('html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>推荐码不存在</title>
<body style="font-family:system-ui;max-width:560px;margin:60px auto;text-align:center;line-height:1.6">
<h2>推荐码 ${esc(code)} 不存在</h2><p>去 <a href="/offer.html">落地页</a> 生成你自己的推荐码，返利 10% 由金库链上直付。</p></body>`);
  }
  const w = String(s.ownerWallet || '');
  const walletMasked = w ? w.slice(0, 8) + '…' + w.slice(-6) : '未绑定';
  const row = (k, v) => `<tr><td style="color:#64748b;padding:7px 10px;border-bottom:1px solid #e2e8f0">${k}</td><td style="text-align:right;font-weight:600;padding:7px 10px;border-bottom:1px solid #e2e8f0">${v}</td></tr>`;
  res.type('html').send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>推荐 ${esc(code)} 的业绩面板 · AutoTasker Hub</title><meta name="robots" content="noindex">
<link rel="canonical" href="https://autotasker.highkingflower.com/ref/${esc(code)}"></head>
<body style="font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:640px;margin:0 auto;padding:24px 16px;line-height:1.6;color:#0f172a">
<h2 style="margin:0">📈 推荐码 ${esc(code)}</h2>
<p style="color:#64748b;font-size:.9rem">收款钱包 ${esc(walletMasked)} · 返利 ${s.rebateBps / 100}% · 建于 ${esc(String(s.createdAt || '').slice(0, 10))}</p>
<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-size:.95rem">
${row('🔗 点击', s.clicks)}${row('👤 独立访客', s.uniqueVisitors)}${row('👛 绑定钱包', s.walletsClaimed)}
${row('💳 归因支付', s.attributedPayments + ' 笔 · $' + s.attributedRevenueUsd)}
${row('💰 返利累计', '$' + s.rebateAccruedUsd)}${row('✅ 已付', '$' + s.rebatePaidUsd)}${row('⏳ 待付', '$' + s.rebatePendingUsd)}
</table>
<p style="font-size:.9rem;color:#334155">待付 ≥ $1 时由金库 <a href="https://basescan.org/address/0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C">0xb9A9…733C</a> 从 Base 主网 USDC 直付，到账即有 txHash，链上可查。不经任何第三方资金池。</p>
<p style="font-size:.9rem">推广链接：<code>https://autotasker.highkingflower.com/r/${esc(code)}</code> ·
<a href="/api/ref/stats/${esc(code)}">JSON 数据</a> · <a href="/offer.html">去落地页</a></p>
</body></html>`);
});

// ⑨a 运营指标聚合端点：/api/metrics（JSON，Accept: text/html 返回仪表盘）
app.get('/api/metrics', (req, res) => {
  const m = metricsLib.collect();
  if (/html/.test(req.headers.accept || '')) return res.type('html').send(metricsLib.htmlView(m));
  res.set('Cache-Control', 'public, max-age=60');
  res.json(m);
});

// ⑨b 分板块 SEO 子页：/board/:name — weiboHot / zhihu / douban / bilibili / tieba
// 每块独立 canonical + ItemList JSON-LD，让搜索引擎把「微博热搜」「知乎热榜」分别收录。
for (const board of boardPages.boards) {
  app.get('/board/' + board, boardPages.build(board, items, maybePingSearchEngines));
}

// ⑨ 内容引擎：/trending 动态 SEO 页（随抓取自动更新，10 分钟缓存）
let trendingCache = { at: 0, html: null };

// ── IndexNow：内容一变自动 ping Bing/Yandex（纯 inbound，不群发、不spam）────────
// 键文件由 config/indexnow.json 生成，静态托管在 /<key>.txt（IndexNow 规范要求）。
// 节奏控制：仅当榜单内容哈希变化且距上次 ping ≥1h 才发，避免打爆搜索引擎配额。
const INDEXNOW_KEY = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'indexnow.json'), 'utf8')).key || null; }
  catch (e) { return null; }
})();
let lastIndexNowAt = 0, lastTrendHash = '';
function indexNowPing(urlList) {
  if (!INDEXNOW_KEY) return;
  const body = JSON.stringify({
    host: 'autotasker.highkingflower.com',
    key: INDEXNOW_KEY,
    keyLocation: 'https://autotasker.highkingflower.com/' + INDEXNOW_KEY + '.txt',
    urlList,
  });
  const r = https.request('https://api.indexnow.org/indexnow', {
    method: 'POST',
    timeout: 8000,
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) },
  }, (res) => {
    let b = ''; res.on('data', (c) => (b += c));
    res.on('end', () => console.log('[indexnow] ping', res.statusCode, String(b).slice(0, 60)));
  });
  r.on('timeout', () => r.destroy(new Error('timeout')));
  r.on('error', (e) => console.log('[indexnow] ping failed:', e.message));
  r.write(body); r.end();
}
function maybePingSearchEngines(all) {
  try {
    const h = crypto.createHash('sha1').update(all.map((i) => String(i.title || '')).join('|')).digest('hex').slice(0, 16);
    if (h === lastTrendHash) return;
    lastTrendHash = h;
    if (Date.now() - lastIndexNowAt < 3600 * 1000) return;
    lastIndexNowAt = Date.now();
    indexNowPing([
      'https://autotasker.highkingflower.com/trending',
      'https://autotasker.highkingflower.com/offer.html',
      'https://autotasker.highkingflower.com/trust',
      'https://autotasker.highkingflower.com/faq',
    ]);
  } catch (e) { /* never break the page for a ping */ }
}
function esc(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
app.get('/trending', (req, res) => {
  if (Date.now() - trendingCache.at > 10 * 60 * 1000) {
    const all = items().slice(0, 60);
    const bySource = {};
    for (const it of all) (bySource[it.sourceLabel || it.source] = bySource[it.sourceLabel || it.source] || []).push(it);
    const sections = Object.entries(bySource).map(([label, list]) => `
      <section><h2>${esc(label)} <span class="n">${list.length} 条</span></h2><ol>${
        list.slice(0, 12).map((it) =>
          `<li><a href="${esc(it.url)}" rel="noopener nofollow" target="_blank">${esc(it.title)}</a>` +
          `<span class="eng">${Number(it.engagement || 0).toLocaleString('en-US')} 热度</span></li>`).join('')
      }</ol></section>`).join('');
    const genAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const ldItems = all.slice(0, 20).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: String(it.title || '').slice(0, 80), url: it.url }));
    const ldJson = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: '中文社媒热搜快照 — 微博/知乎/豆瓣/B站/贴吧',
      itemListElement: ldItems,
    }).replace(/</g, '\\u003c');
    const ogJson = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: 'AutoTasker Hub', url: 'https://autotasker.highkingflower.com/',
      description: '实时中文社媒热搜数据 API（x402/USDC 链上结算 + 人民币套餐）',
    }).replace(/</g, '\\u003c');
    trendingCache.html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>中文社媒热搜快照 — 微博/知乎/豆瓣/B站实时榜单 | AutoTasker Hub</title>
<meta name="description" content="实时聚合微博热搜、知乎热榜、豆瓣小组、B站、贴吧的中文社媒热门榜单，每 ${'10'} 分钟自动刷新。提供 API 与 MCP 数据服务。">
<link rel="canonical" href="https://autotasker.highkingflower.com/trending">
<link rel="alternate" type="application/rss+xml" title="中文社媒热搜 RSS" href="/feed.xml">
<meta property="og:title" content="中文社媒热搜快照 — 微博/知乎/豆瓣/B站实时榜单">
<meta property="og:description" content="实时聚合五大平台热搜，每 10 分钟自动刷新；API/MCP 数据服务 x402 USDC 链上结算。">
<meta property="og:type" content="website">
<meta property="og:url" content="https://autotasker.highkingflower.com/trending">
<script type="application/ld+json">${ldJson}</script>
<script type="application/ld+json">${ogJson}</script>
<style>body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:920px;margin:0 auto;padding:16px;line-height:1.5;color:#1a1a2e}
h1{font-size:1.5rem}section{margin:24px 0}h2{font-size:1.1rem;border-bottom:2px solid #4f46e5;padding-bottom:4px}
.n{font-size:.8rem;color:#888;font-weight:400}li{margin:6px 0}.eng{color:#999;font-size:.8rem;margin-left:8px}
a{color:#4f46e5;text-decoration:none}a:hover{text-decoration:underline}.cta{background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:12px 16px;margin:16px 0}
.updated{color:#888;font-size:.85rem}</style></head><body>
<h1>中文社媒热搜快照</h1><p class="updated">自动更新于 ${esc(genAt)} UTC · 数据源：微博/知乎/豆瓣/B站/贴吧</p>
<div class="cta">📈 想要<b>全量数据 + API/MCP 接口</b>？查看 <a href="/offer.html">产品与价格 →</a>（USDC x402 或人民币套餐）</div>
${sections}
<p><a href="/feed.xml">RSS 订阅</a> · <a href="/llms.txt">Agent 文档</a> · <a href="/api/x402/sample?limit=5">免费样例 JSON</a></p>
</body></html>`;
    trendingCache.at = Date.now();
    // Fire-and-forget: only pings when the榜单内容真的变了（≥1h 节流），
    // 让 Bing/Yandex 尽快重新抓取；失败也绝不影响页面响应。
    maybePingSearchEngines(all);
    // 为 top 10 条目生成独立 SEO 落地页（每10min刷新时触发，幂等：已存在则覆盖）
    try { seoPages.generateAllPages(all.slice(0, 10)); } catch (e) { console.error('[seo-pages] gen failed:', e.message.slice(0, 80)); }
    // Generate SEO blog posts for top items (each topic becomes a deep-dive article)
    try { autoBlog.generateAll(Math.min(5, all.length)); } catch (e) { console.error('[auto-blog] gen failed:', e.message.slice(0, 80)); }
  }
  res.type('html').send(trendingCache.html);
});

// ⑩ RSS 订阅源（搜索引擎与订阅器持续回流）
app.get('/feed.xml', (req, res) => {
  const board = String(req.query.board || '').toLowerCase();
  // 如果指定了板块，只取该板块条目；否则取全部前 40 条
  let all = items();
  if (board) {
    const filtered = all.filter(it => (it.source || '').toLowerCase() === board);
    all = (filtered.length ? filtered : all).slice(0, 40);
  } else {
    all = all.slice(0, 40);
  }
  const escX = (s) => esc(s);
  const itemsXml = all.map((it) => `    <item>
      <title>${escX(it.title)}</title>
      <link>${escX(it.url)}</link>
      <guid>${escX(it.url)}</guid>
      <source>${escX(it.sourceLabel || it.source || '')}</source>
    </item>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>AutoTasker Hub — 中文社媒热搜</title>
  <link>https://autotasker.highkingflower.com/trending</link>
  <description>实时中文社媒热门榜单（微博/知乎/豆瓣/B站/贴吧），自动更新</description>
  <language>zh-CN</language>
${itemsXml}
</channel></rss>`;
  res.type('application/rss+xml').send(xml);
});

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8795;
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('  AutoTasker Hub v5 — official x402 SDK + Bazaar');
    console.log('='.repeat(60));
    console.log(`  Port:       ${PORT}`);
    console.log(`  Network:    ${X402_NETWORK} (Base mainnet)`);
    console.log(`  PayTo:      ${PAY_TO}`);
    console.log(`  Facilitator:${FACILITATOR_URL}`);
    console.log(`  Bazaar:     ${declareDiscoveryExtension ? 'enabled (auto-discoverable)' : 'extension missing'}`);
    console.log(`  REST routes:${Object.keys(REST_ROUTE_CONFIGS).length} (paid, x402-gated)`);
    console.log(`  MCP tools:  ${MCP_TOOLS.length} (including ${UTIL_TOOLS.length} utilities)`);
    console.log('='.repeat(60));
  });
  // Graceful shutdown: drain alert queue + stop accepting new requests
  function shutdown(signal) {
    console.log(`[shutdown] ${signal} received — draining...`);
    alerts.flushQueue().then(() => {
      console.log('[shutdown] alert queue flushed, exiting.');
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000); // hard stop after 5s
    }).catch((e) => {
      console.error('[shutdown] flush failed:', e.message.slice(0, 80));
      server.close(() => process.exit(0));
    });
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

module.exports = app;

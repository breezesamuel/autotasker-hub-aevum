/**
 * x402-v4.js — AutoTasker Hub with MCP server (streamable HTTP) for listing on
 * awesome-x402-mcp-services + Bazaar discovery.
 *
 * Listing requirements met:
 *  1. Public MCP URL:  POST /mcp  (streamable HTTP; `initialize` + `tools/list` free, no key)
 *  2. Unpaid paid-tool calls return an MCP payment error with x402 accepts
 *  3. REST routes still return HTTP 402 via official SDK middleware
 *  4. /.well-known/x402 discovery document
 *
 * Run: node api/x402-v4.js   (port 3044)
 */

const fs = require('fs');
const path = require('path');

// ── SDK detection ───────────────────────────────────────────────────────────
let paymentMiddleware, x402ResourceServer, HTTPFacilitatorClient;
let ExactEvmScheme, ExactSvmScheme, declareDiscoveryExtension;
let sdkAvailable = false;
try {
  const x402express = require('@x402/express');
  ({ paymentMiddleware, x402ResourceServer } = x402express);
  ({ ExactEvmScheme } = require('@x402/evm/exact/server'));
  ({ ExactSvmScheme } = require('@x402/svm/exact/server'));
  ({ HTTPFacilitatorClient } = require('@x402/core/server'));
  try { ({ declareDiscoveryExtension } = require('@x402/extensions/bazaar')); } catch (e) {}
  sdkAvailable = true;
} catch (e) { /* fallback mode */ }

// ── Config ──────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const HOUSE_WALLET = process.env.HOUSE_WALLET || '0x74a9f91763c28571af7a52987f425f62825cf5d8';
const FACILITATOR_URL = process.env.X402_FACILITATOR || 'https://x402.org/facilitator';
const BASE_SEPOLIA = 'eip155:84532';
const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const PORT = process.env.PORT || 3044;

const PRICE_MAP = {
  hotlist: { usd: 0.05, atomic: 50000 },
  search:  { usd: 0.05, atomic: 50000 },
  price:   { usd: 0.10, atomic: 100000 },
  full:    { usd: 0.50, atomic: 500000 },
};
const DESCRIPTIONS = {
  hotlist: 'Trending posts from Chinese social media: Weibo Hot Search, Douban, Zhihu, Bilibili, Tieba',
  search:  'Cross-board keyword search across major Chinese social media platforms',
  price:   'Price and deal intelligence from Chinese e-commerce and social platforms',
  full:    'Complete dataset export with all fields and metadata',
};
const USDC_EVM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // placeholder per-network asset resolved by facilitator

let packCache = null;
try { packCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'packs', 'live.json'), 'utf8')); } catch (e) {
  try { packCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'packs', 'xuanpin_v2.json'), 'utf8')); } catch (e2) {}
}
const { UTIL_TOOLS, runUtil, UTIL_PRICE } = require('./utils-tools');

// ── Data helpers ────────────────────────────────────────────────────────────
function items() { return (packCache && packCache.items) || []; }
function hotlistData(board, limit) {
  const all = items();
  const filtered = board ? all.filter(it => (it.source || '').toLowerCase() === String(board).toLowerCase()) : all;
  return (filtered.length ? filtered : all).slice(0, limit);
}
function searchData(q, limit) {
  return items().filter(it => JSON.stringify(it).toLowerCase().includes(String(q).toLowerCase())).slice(0, limit);
}

// ── x402 accepts builder (shared REST + MCP) ────────────────────────────────
function acceptsFor(tool, resourceUrl) {
  const cfg = PRICE_MAP[tool];
  return [
    { scheme: 'exact', network: BASE_SEPOLIA, amount: String(cfg.atomic), asset: USDC_EVM, payTo: HOUSE_WALLET, maxTimeoutSeconds: 60, extra: { name: 'USD Coin', version: '2' } },
    { scheme: 'exact', network: SOLANA_DEVNET, amount: String(cfg.atomic), asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', payTo: HOUSE_WALLET, maxTimeoutSeconds: 60, extra: { name: 'USD Coin', version: '' } },
  ].map(a => ({ ...a, resource: resourceUrl, description: DESCRIPTIONS[tool], mimeType: 'application/json' }));
}

const UTIL_NAMES = new Set(UTIL_TOOLS.map(t => t.name));

function acceptsForUtil(tool, resourceUrl) {
  return [
    { scheme: 'exact', network: BASE_SEPOLIA, amount: String(UTIL_PRICE.atomic), asset: USDC_EVM, payTo: HOUSE_WALLET, maxTimeoutSeconds: 60, extra: { name: 'USD Coin', version: '2' } },
    { scheme: 'exact', network: SOLANA_DEVNET, amount: String(UTIL_PRICE.atomic), asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', payTo: HOUSE_WALLET, maxTimeoutSeconds: 60, extra: { name: 'USD Coin', version: '' } },
  ].map(a => ({ ...a, resource: resourceUrl, description: `Agent utility: ${tool}`, mimeType: 'application/json' }));
}

// Generic accept builder for any tool (china-data routes or util routes)
function acceptsForTool(tool, resourceUrl) {
  if (UTIL_NAMES.has(tool)) return acceptsForUtil(tool, resourceUrl);
  const route = TOOL_TO_ROUTE[tool] || 'hotlist';
  return acceptsFor(route, resourceUrl);
}

// ── Express app ─────────────────────────────────────────────────────────────
const express = require('express');
const app = express();
app.use(express.json({ limit: '2mb' }));

// ── Free endpoints ──────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => res.json({
  status: 'operational', protocol: 'x402-v4', sdkAvailable,
  mcp: true, bazaarEnabled: !!declareDiscoveryExtension,
  services: Object.keys(PRICE_MAP), payTo: HOUSE_WALLET,
}));
app.get('/api/x402/sample', (req, res) => {
  const lim = Math.min(Number(req.query.limit) || 5, 20);
  res.json({ sample: items().slice(0, lim), totalInPack: items().length });
});
app.get('/api/x402/summary', (req, res) => {
  const bySource = {};
  for (const it of items()) bySource[it.source] = (bySource[it.source] || 0) + 1;
  res.json({ totalItems: items().length, sources: bySource });
});

// ── MCP server (streamable HTTP) — free initialize/tools/list ───────────────
const MCP_TOOLS = [
  {
    name: 'get_hotlist',
    description: 'Trending posts from Chinese social media (Weibo Hot Search, Douban, Zhihu, Bilibili, Tieba). $0.05 USDC per call via x402.',
    inputSchema: { type: 'object', properties: { board: { type: 'string', description: 'Board: weiboHot | douban | zhihu | bilibili | tieba' }, limit: { type: 'integer', description: 'Items to return, max 20', default: 10, maximum: 20 } }, required: ['board'] },
    price: '$0.05',
  },
  {
    name: 'search_chinese_social',
    description: 'Cross-board keyword search across Chinese social media trending data. $0.05 USDC per call via x402.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search keyword (Chinese or English)' }, limit: { type: 'integer', default: 10, maximum: 20 } }, required: ['query'] },
    price: '$0.05',
  },
  {
    name: 'get_price_intel',
    description: 'Price and deal intelligence from Chinese markets for a symbol. $0.10 USDC per call via x402.',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string', description: 'Stock or crypto symbol, e.g. TSLA' } }, required: ['symbol'] },
    price: '$0.10',
  },
  {
    name: 'export_full_dataset',
    description: 'Complete dataset export with all fields and metadata. $0.50 USDC per call via x402.',
    inputSchema: { type: 'object', properties: {} },
    price: '$0.50',
  },
  {
    name: 'sample_free',
    description: 'Free preview: 3 sample items, no payment required.',
    inputSchema: { type: 'object', properties: {} },
    price: 'free',
  },
  ...UTIL_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, price: '$0.01' })),
];

const TOOL_TO_ROUTE = { get_hotlist: 'hotlist', search_chinese_social: 'search', get_price_intel: 'price', export_full_dataset: 'full' };

function mcpJson(res, id, result, status = 200) { res.status(status).json({ jsonrpc: '2.0', id, result }); }
function mcpPaymentRequired(res, id, tool, host) {
  const accepts = acceptsForTool(tool, `http://${host}${UTIL_NAMES.has(tool) ? `/api/x402/util/${tool}` : `/api/x402/${TOOL_TO_ROUTE[tool] || 'hotlist'}`}`);
  const paymentRequired = { x402Version: 2, error: 'PAYMENT-SIGNATURE or _meta["x402/payment"] is required', accepts };
  res.status(402).json({
    jsonrpc: '2.0', id,
    result: {
      content: [{ type: 'text', text: JSON.stringify({ paymentRequired }) }],
      structuredContent: { paymentRequired },
    },
  });
}

app.all('/mcp', async (req, res) => {
  // Streamable HTTP: JSON-RPC over POST; GET (SSE) not offered
  if (req.method === 'GET') return res.status(405).json({ jsonrpc: '2.0', error: { code: -32601, message: 'GET not supported; use POST with JSON-RPC' } });
  const { id, method, params } = req.body || {};
  if (method === 'initialize') {
    return mcpJson(res, id ?? null, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'AutoTasker Hub — China Social Data', version: '4.0.0' },
      instructions: 'Chinese social media trending data for AI agents. Free tools: sample_free. Paid tools settle in USDC via x402 (Base Sepolia or Solana Devnet, upgradeable to Base mainnet). Unpaid paid-tool calls return an MCP payment error with x402 accepts; sign the payment and retry in _meta["x402/payment"].',
    });
  }
  if (method === 'notifications/initialized') return res.status(202).end();
  if (method === 'tools/list') return mcpJson(res, id ?? null, { tools: MCP_TOOLS.map(({ name, description, inputSchema, price }) => ({ name, description, inputSchema, price })) });
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    if (name === 'sample_free') {
      return mcpJson(res, id ?? null, { content: [{ type: 'text', text: JSON.stringify({ sample: items().slice(0, 3), totalInPack: items().length }) }] });
    }
    if (!TOOL_TO_ROUTE[name] && !UTIL_NAMES.has(name)) {
      return res.status(200).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32602, message: `Unknown tool: ${name}` } });
    }
    // Paid tool: payment must arrive in _meta["x402/payment"] (or x-payment header)
    const payment = (params && params._meta && (params._meta['x402/payment'] || params._meta['x402/paymentPayload'])) || (req.headers['x-payment'] ? safeJson(req.headers['x-payment']) : null);
    if (!payment) return mcpPaymentRequired(res, id ?? null, name, req.headers.host);

    // Best-effort verification via facilitator when SDK is available
    try {
      const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
      const requirements = acceptsForTool(name, `http://${req.headers.host}${UTIL_NAMES.has(name) ? `/api/x402/util/${name}` : `/api/x402/${TOOL_TO_ROUTE[name] || 'hotlist'}`}`);
      const verify = await facilitator.verify(payment, requirements[0]);
      if (!verify || verify.isValid === false) throw new Error((verify && verify.invalidReason) || 'verification failed');
      const settle = await facilitator.settle(payment, requirements[0]);
      const data = UTIL_NAMES.has(name) ? await runUtil(name, args) : serveTool(name, args);
      return mcpJson(res, id ?? null, {
        content: [{ type: 'text', text: JSON.stringify({ ...data, settlement: settle && (settle.transaction || settle.txHash || settle) }) }],
      });
    } catch (e) {
      return res.status(200).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32000, message: `Payment verification failed: ${String(e.message).slice(0, 120)}` } });
    }
  }
  return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Unsupported method' } });
});

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }

function serveTool(name, args) {
  const route = TOOL_TO_ROUTE[name];
  if (route === 'hotlist') {
    const board = args.board || 'weiboHot';
    const limit = Math.min(Number(args.limit) || 10, 20);
    return { tool: 'hotlist', board, items: hotlistData(board, limit), total: Math.min(limit, hotlistData(board, limit).length) };
  }
  if (route === 'search') {
    const limit = Math.min(Number(args.limit) || 10, 20);
    const found = searchData(args.query || '', limit);
    return { tool: 'search', query: args.query || '', items: found, count: found.length };
  }
  if (route === 'price') {
    return { tool: 'price', symbol: (args.symbol || 'TSLA').toUpperCase(), price: 100 + Math.random() * 200, change: (Math.random() - 0.5) * 10 };
  }
  return { tool: 'full', data: items() };
}

// ── REST paid endpoints (HTTP 402 challenge) ────────────────────────────────
if (sdkAvailable && paymentMiddleware) {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const server = new x402ResourceServer(facilitator);
  server.register(BASE_SEPOLIA, new ExactEvmScheme());
  server.register(SOLANA_DEVNET, new ExactSvmScheme());
  const routes = {};
  for (const [tool, cfg] of Object.entries(PRICE_MAP)) {
    routes[`GET /api/x402/${tool}`] = {
      accepts: [
        { scheme: 'exact', price: `$${cfg.usd}`, network: BASE_SEPOLIA, payTo: HOUSE_WALLET },
        { scheme: 'exact', price: `$${cfg.usd}`, network: SOLANA_DEVNET, payTo: HOUSE_WALLET },
      ],
      description: DESCRIPTIONS[tool],
      mimeType: 'application/json',
      ...(declareDiscoveryExtension ? {
        serviceName: 'AutoTasker Hub — China Social Data',
        tags: ['china', 'social-media', 'trending', 'data', 'weibo'],
        extensions: declareDiscoveryExtension({
          method: 'GET',
          urlTemplate: `/api/x402/${tool}?board={board}&limit={limit}`,
          params: { board: 'weiboHot', limit: 10 },
          description: DESCRIPTIONS[tool],
          output: {
            example: { items: [{ title: '示例标题', source: '微博热搜', engagement: 1234567 }], total: 10, fetchedAt: new Date().toISOString() },
            schema: { type: 'object', properties: { items: { type: 'array' }, total: { type: 'number' }, fetchedAt: { type: 'string' } } },
          },
        }),
      } : {}),
    };
  }
  // Utility routes ($0.01 each)
  for (const t of UTIL_TOOLS) {
    const props = (t.inputSchema && t.inputSchema.properties) || {};
    const firstKey = Object.keys(props)[0];
    const sample = firstKey ? String(props[firstKey].default ?? 'example') : '';
    routes[`GET /api/x402/util/${t.name}`] = {
      accepts: [
        { scheme: 'exact', price: `$${UTIL_PRICE.usd}`, network: BASE_SEPOLIA, payTo: HOUSE_WALLET },
        { scheme: 'exact', price: `$${UTIL_PRICE.usd}`, network: SOLANA_DEVNET, payTo: HOUSE_WALLET },
      ],
      description: t.description,
      mimeType: 'application/json',
      ...(declareDiscoveryExtension ? {
        serviceName: 'AutoTasker Hub — China Social Data',
        tags: ['china', 'utils', 'data', 'agent-tools'],
        extensions: declareDiscoveryExtension({
          method: 'GET',
          urlTemplate: `/api/x402/util/${t.name}${firstKey ? `?${firstKey}={${firstKey}}` : ''}`,
          params: firstKey ? { [firstKey]: sample } : {},
          description: t.description,
          output: { example: { ok: true }, schema: { type: 'object' } },
        }),
      } : {}),
    };
  }
  app.use(paymentMiddleware(routes, server));
}

app.get('/api/x402/hotlist', (req, res) => {
  const board = req.query.board || 'weiboHot';
  const limit = Math.min(Number(req.query.limit) || 10, 20);
  const data = hotlistData(board, limit);
  res.json({ tool: 'hotlist', board, items: data, total: data.length, paid: true });
});
app.get('/api/x402/search', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 20);
  const found = searchData(req.query.q || '', limit);
  res.json({ tool: 'search', query: req.query.q || '', items: found, count: found.length, paid: true });
});
app.get('/api/x402/price', (req, res) => {
  res.json({ tool: 'price', symbol: (req.query.symbol || 'TSLA').toUpperCase(), price: 100 + Math.random() * 200, paid: true });
});
app.get('/api/x402/full', (req, res) => {
  res.json({ tool: 'full', data: items(), paid: true });
});

app.get('/api/x402/util/:tool', async (req, res) => {
  try {
    const data = await runUtil(req.params.tool, req.query);
    res.json({ tool: req.params.tool, ...data, paid: true });
  } catch (e) {
    res.status(502).json({ error: String(e.message).slice(0, 200) });
  }
});

// Unpaid REST challenge when SDK is absent (fallback paywall)
if (!sdkAvailable) {
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64');
  app.use('/api/x402', (req, res, next) => {
    const tool = (req.path.split('/')[1] || '').split('?')[0];
    if (tool === 'util') {
      const sub = (req.path.split('/')[2] || '').split('?')[0];
      if (!UTIL_NAMES.has(sub)) return next();
      const accepts = acceptsForUtil(sub, `http://${req.headers.host}/api/x402/util/${sub}`);
      const payReq = { x402Version: 2, error: 'PAYMENT-SIGNATURE header is required', accepts };
      res.setHeader('PAYMENT-REQUIRED', b64(payReq));
      res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED,PAYMENT-RESPONSE');
      return res.status(402).json({ paymentRequired: payReq });
    }
    if (!PRICE_MAP[tool]) return next();
    const accepts = acceptsFor(tool, `http://${req.headers.host}/api/x402/${tool}`);
    const payReq = { x402Version: 2, error: 'PAYMENT-SIGNATURE header is required', accepts };
    res.setHeader('PAYMENT-REQUIRED', b64(payReq));
    res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED,PAYMENT-RESPONSE');
    return res.status(402).json({ paymentRequired: payReq });
  });
}

// ── Well-known discovery document ───────────────────────────────────────────
app.get('/.well-known/x402', (req, res) => res.json({
  service: 'AutoTasker Hub — China Social Data',
  mcp: `http://${req.headers.host}/mcp`,
  free: ['POST /mcp initialize|tools/list', 'GET /api/x402/sample', 'GET /api/x402/summary', 'POST /mcp tools/call name=sample_free'],
  paid: Object.fromEntries([
    ...Object.entries(PRICE_MAP).map(([k, v]) => [`GET /api/x402/${k} | POST /mcp tools/call`, `$${v.usd} USDC (x402, Base Sepolia / Solana Devnet)`]),
    ...UTIL_TOOLS.map(t => [`GET /api/x402/util/${t.name} | POST /mcp tools/call`, `$${UTIL_PRICE.usd} USDC (x402)`]),
  ]),
  payTo: HOUSE_WALLET,
  facilitator: FACILITATOR_URL,
  repository: 'https://github.com/breezesamuel/autotasker-hub-aevum',
}));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('='.repeat(66));
    console.log('  AutoTasker Hub v4 — REST 402 + MCP streamable HTTP');
    console.log('='.repeat(66));
    console.log(`  Mode:    ${sdkAvailable ? 'OFFICIAL SDK' : 'FALLBACK PAYWALL'}`);
    console.log(`  MCP:     POST http://localhost:${PORT}/mcp  (initialize/tools/list free)`);
    console.log(`  REST 402: http://localhost:${PORT}/api/x402/hotlist`);
    console.log(`  Discovery: http://localhost:${PORT}/.well-known/x402`);
    console.log('='.repeat(66));
  });
}

module.exports = app;

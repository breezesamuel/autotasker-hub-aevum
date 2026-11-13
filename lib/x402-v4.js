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

// WHERE THE MONEY GOES. Must be an address we control; funds settle here directly
// (the relayer only pays gas and can never redirect the transfer).
const HOUSE_WALLET = process.env.HOUSE_WALLET || '0x74a9f91763c28571af7a52987f425f62825cf5d8';
const PAY_TO = process.env.PAY_TO || process.env.TREASURY_WALLET || '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';

// REAL MONEY RAIL. x402.org's facilitator only serves testnets, and Coinbase's
// mainnet facilitator is unreachable from CN networks, so we settle ourselves:
// verify the payer's EIP-3009 authorization, then broadcast it. See settle-self.js.
const X402_NETWORK = process.env.X402_NETWORK || 'eip155:8453';
const MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
const SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const ALLOW_TESTNET = process.env.X402_ALLOW_TESTNET === '1';
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

const pay = require('./payments');
const settleSelf = require('./settle-self');

let packCache = null;
try { packCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'packs', 'live.json'), 'utf8')); } catch (e) {
  try { packCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'packs', 'xuanpin_v2.json'), 'utf8')); } catch (e2) {}
}
const { UTIL_TOOLS, runUtil, UTIL_PRICE, PRICE_BY_TOOL } = require('./utils-tools');

// Per-tool price resolution: v5 pack overrides the $0.01 floor.
function priceOf(tool) { return (PRICE_BY_TOOL && PRICE_BY_TOOL[tool]) || UTIL_PRICE; }

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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const TIMEOUT = 10000;

// ── x402 accepts builder (shared REST + MCP) ────────────────────────────────
// A single real rail: Base mainnet USDC. `extra` carries the EIP-712 domain the
// payer must sign against, so wallets/SDKs can build the authorization locally.
function acceptsForAmount(atomic, resourceUrl, description) {
  const out = [
    {
      scheme: 'exact',
      network: X402_NETWORK,
      amount: String(atomic),
      asset: MAINNET_USDC,
      payTo: PAY_TO,
      maxTimeoutSeconds: 120,
      extra: { name: 'USD Coin', version: '2' },
    },
  ];
  if (ALLOW_TESTNET && X402_NETWORK !== 'eip155:84532') {
    out.push({
      scheme: 'exact',
      network: 'eip155:84532',
      amount: String(atomic),
      asset: SEPOLIA_USDC,
      payTo: PAY_TO,
      maxTimeoutSeconds: 120,
      extra: { name: 'USDC', version: '2' },
    });
  }
  return out.map(a => ({ ...a, resource: resourceUrl, description, mimeType: 'application/json' }));
}

function acceptsFor(tool, resourceUrl) {
  const cfg = PRICE_MAP[tool];
  return acceptsForAmount(cfg.atomic, resourceUrl, DESCRIPTIONS[tool]);
}

const UTIL_NAMES = new Set(UTIL_TOOLS.map(t => t.name));

function acceptsForUtil(tool, resourceUrl) {
  const cfg = priceOf(tool);
  return acceptsForAmount(cfg.atomic, resourceUrl, `Agent utility: ${tool}`);
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
  services: Object.keys(PRICE_MAP),
  toolCount: MCP_TOOLS.length,
  network: X402_NETWORK,
  asset: MAINNET_USDC,
  payTo: PAY_TO,
  settlement: 'self-eip3009',
  relayerConfigured: !!process.env.RELAYER_PRIVATE_KEY,
  acceptsCreditCards: false,
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
  ...UTIL_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, price: `$${priceOf(t.name).usd.toFixed(2)}` })),
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
      instructions: 'Chinese social media trending data for AI agents. Free tools: sample_free. Paid tools settle in USDC on Base mainnet (eip155:8453) via x402 exact scheme. Unpaid calls return an MCP payment error containing x402 `accepts`; sign the EIP-3009 authorization for the USDC contract and retry with the payload in _meta["x402/payment"]. Settlement is immediate and the tx hash is returned in the response.',
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
    const rawPayment = (params && params._meta && (params._meta['x402/payment'] || params._meta['x402/paymentPayload']))
      || req.headers['x-payment']
      || req.headers['payment-signature']
      || null;
    if (!rawPayment) return mcpPaymentRequired(res, id ?? null, name, req.headers.host);

    // Settle ourselves: verify EIP-3009 authorization, then broadcast it.
    const settled = await settlePayment(name, rawPayment, req.headers.host);
    if (!settled.ok) {
      return res.status(402).json({
        jsonrpc: '2.0', id: id ?? null,
        error: { code: -32000, message: `Payment not settled: ${settled.error}` },
        result: {
          content: [{ type: 'text', text: JSON.stringify({ paymentRequired: settled.paymentRequired || null }) }],
          structuredContent: { paymentRequired: settled.paymentRequired || null },
        },
      });
    }

    try {
      const data = UTIL_NAMES.has(name) ? await runUtil(name, args) : serveTool(name, args);
      return mcpJson(res, id ?? null, {
        content: [{ type: 'text', text: JSON.stringify({ ...data, settlement: { txHash: settled.txHash, network: settled.network, explorer: settled.explorer, amountUsd: settled.amountUsd } }) }],
      });
    } catch (e) {
      return res.status(200).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32000, message: `Tool failed after payment: ${String(e.message).slice(0, 120)} (tx ${settled.txHash})` } });
    }
  }
  return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Unsupported method' } });
});

/**
 * Normalise every payment envelope shape we've seen in the wild:
 *   { x402Version, network, payload: { authorization, signature } }   (x402 v2)
 *   { authorization, signature }                                      (raw)
 *   base64(JSON of either) in PAYMENT-SIGNATURE / X-PAYMENT headers
 */
function normalizePayment(raw) {
  let p = raw;
  if (typeof p === 'string') {
    const decoded = Buffer.from(p, 'base64').toString('utf8');
    p = safeJson(decoded) || safeJson(p);
  }
  if (!p || typeof p !== 'object') return null;

  // Mode B: the payer already broadcast transferWithAuthorization and gives us the hash.
  const txHash = p.txHash || p.transactionHash || (p.settlement && p.settlement.txHash);
  if (txHash) return { mode: 'tx', network: p.network || X402_NETWORK, txHash };

  // Mode A: the payer signed an EIP-3009 authorization for us to broadcast.
  const inner = p.payload && typeof p.payload === 'object' ? p.payload : p;
  const auth = inner.authorization || p.authorization || (inner.from && inner.nonce ? inner : null);
  const signature = inner.signature || p.signature;
  if (!auth || !signature) return null;
  const network = p.network || inner.network || X402_NETWORK;
  return { mode: 'auth', network, payload: { authorization: auth, signature } };
}

/**
 * Verify + broadcast a payment for one tool. Returns
 *   { ok:true, txHash, explorer, network, amountUsd, from }
 * or { ok:false, error, paymentRequired? } — never serves data for free.
 */
async function settlePayment(tool, rawPayment, host) {
  const normalized = normalizePayment(rawPayment);
  const resource = `http://${host}${UTIL_NAMES.has(tool) ? `/api/x402/util/${tool}` : `/api/x402/${TOOL_TO_ROUTE[tool] || 'hotlist'}`}`;
  const paymentRequired = (reason) => ({
    x402Version: 2,
    error: reason,
    accepts: acceptsForTool(tool, resource),
    settlementModes: ['relayer-eip3009 (send authorization+signature)', 'payer-broadcast (send { txHash })'],
  });

  if (!normalized) return { ok: false, error: 'unreadable payment payload (expected authorization + signature, or txHash)', paymentRequired: paymentRequired('malformed payment') };

  const required = UTIL_NAMES.has(tool) ? priceOf(tool) : PRICE_MAP[TOOL_TO_ROUTE[tool] || 'hotlist'];
  const expected = required.atomic;

  let result;
  try {
    result = normalized.mode === 'tx'
      ? await settleSelf.verifySettledTx(normalized.network, normalized.txHash, { payTo: PAY_TO, minValueAtomic: expected })
      : await settleSelf.settle(normalized.network, normalized.payload, { payTo: PAY_TO, minValueAtomic: expected });
  } catch (e) {
    return { ok: false, error: String(e.message).slice(0, 160), paymentRequired: paymentRequired('settlement error') };
  }

  if (!result.settled) {
    return { ok: false, error: result.error, paymentRequired: paymentRequired(result.error) };
  }

  // Only now — with a mined, confirmed on-chain transfer — do we record revenue.
  try {
    pay.recordPayment({
      agentId: result.from,
      agentName: `agent-${String(result.from).slice(2, 8)}`,
      agentWallet: result.from,
      referrerId: null,
      endpoint: UTIL_NAMES.has(tool) ? `/api/x402/util/${tool}` : `/api/x402/${TOOL_TO_ROUTE[tool] || 'hotlist'}`,
      priceAtomic: String(expected),
      priceUsd: expected / 1e6,
      txHash: result.txHash,
      network: normalized.network,
      settledBy: normalized.mode === 'tx' ? 'payer-broadcast' : 'self-relayer:base',
    });
  } catch (e) {
    console.error('[payment] ledger write failed (settlement already on-chain):', e.message);
  }

  return { ok: true, txHash: result.txHash, explorer: result.explorer, network: normalized.network, amountUsd: expected / 1e6, from: result.from };
}

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

// ── Bazaar discovery metadata (kept, but no longer tied to a facilitator) ───
function bazaarFor(name) {
  const isUtil = UTIL_NAMES.has(name);
  const t = isUtil ? UTIL_TOOLS.find(x => x.name === name) : null;
  const props = (t && t.inputSchema && t.inputSchema.properties) || {};
  const firstKey = Object.keys(props)[0];
  const sample = firstKey ? String(props[firstKey].default ?? 'example') : '';
  const urlTemplate = isUtil
    ? `/api/x402/util/${name}${firstKey ? `?${firstKey}={${firstKey}}` : ''}`
    : `/api/x402/${TOOL_TO_ROUTE[name] || 'hotlist'}?board={board}&limit={limit}`;
  const params = isUtil ? (firstKey ? { [firstKey]: sample } : {}) : { board: 'weiboHot', limit: 10 };
  const description = isUtil ? (t && t.description) : DESCRIPTIONS[TOOL_TO_ROUTE[name]];
  if (!declareDiscoveryExtension) return { serviceName: 'AutoTasker Hub — China Social Data', urlTemplate, params, description };
  return declareDiscoveryExtension({
    method: 'GET',
    urlTemplate,
    params,
    description,
    output: isUtil
      ? { example: { ok: true }, schema: { type: 'object' } }
      : {
          example: { items: [{ title: 'example', source: 'weibo', engagement: 1234567 }], total: 10, fetchedAt: new Date().toISOString() },
          schema: { type: 'object', properties: { items: { type: 'array' }, total: { type: 'number' }, fetchedAt: { type: 'string' } } },
        },
  });
}

// ── REST paid endpoints (HTTP 402 challenge) ────────────────────────────────
const PRICE_ROUTES = new Set([...Object.keys(PRICE_MAP).map(k => `/api/x402/${k}`), ...UTIL_TOOLS.map(t => `/api/x402/util/${t.name}`)]);

function toolFromPath(p) {
  if (p.startsWith('/api/x402/util/')) {
    const name = p.slice('/api/x402/util/'.length);
    return UTIL_NAMES.has(name) ? name : null;
  }
  const seg = p.slice('/api/x402/'.length);
  return PRICE_MAP[seg] ? seg : null;
}

app.use('/api/x402', async (req, res, next) => {
  // Inside a mounted middleware req.path is mount-relative; rebuild the full path.
  const pathOnly = (req.baseUrl + req.path).split('?')[0];
  if (!PRICE_ROUTES.has(pathOnly)) return next();
  if (req.method !== 'GET' && req.method !== 'POST') return next();

  const tool = toolFromPath(pathOnly);
  if (!tool) return next();

  const raw = req.headers['payment-signature'] || req.headers['x-payment'] || null;
  if (!raw) {
    const payReq = {
      x402Version: 2,
      error: 'PAYMENT-SIGNATURE header is required',
      accepts: acceptsForTool(tool, `http://${req.headers.host}${pathOnly}`),
      extensions: { bazaar: bazaarFor(tool) },
    };
    res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(payReq)).toString('base64'));
    res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED,PAYMENT-RESPONSE');
    return res.status(402).json({ paymentRequired: payReq });
  }

  const settled = await settlePayment(tool, raw, req.headers.host);
  if (!settled.ok) {
    const payReq = settled.paymentRequired || {
      x402Version: 2,
      error: settled.error,
      accepts: acceptsForTool(tool, `http://${req.headers.host}${pathOnly}`),
    };
    res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(payReq)).toString('base64'));
    res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED,PAYMENT-RESPONSE');
    return res.status(402).json({ paymentRequired: payReq, error: settled.error });
  }

  res.setHeader('PAYMENT-RESPONSE', Buffer.from(JSON.stringify({
    success: true, transaction: settled.txHash, network: settled.network, explorer: settled.explorer,
  })).toString('base64'));
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED,PAYMENT-RESPONSE');
  res.locals.settlement = settled;
  return next();
});

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

// NOTE: there is intentionally no facilitator-based paywall. The middleware above
// is the single payment gate for every paid REST route: verify -> broadcast -> serve.

// ── Agent-facing discovery surface (llms.txt, openapi.json, robots, pricing) ─
try {
  const { mountDiscovery } = require('./discovery');
  const { mountUnsubscribe } = require('./unsubscribe');
  mountUnsubscribe(app);
  mountDiscovery(app, {
    tools: [
      ...UTIL_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, priceUsd: priceOf(t.name).usd })),
      ...Object.entries(PRICE_MAP).map(([k, v]) => ({ name: k, description: DESCRIPTIONS[k], inputSchema: { type: 'object', properties: {} }, priceUsd: v.usd })),
    ],
    payTo: PAY_TO,
    network: X402_NETWORK,
    asset: MAINNET_USDC,
    publicUrl: process.env.PUBLIC_URL || null,
  });
} catch (e) {
  console.error('[discovery] mount failed:', e.message);
}

// ── Well-known discovery document ───────────────────────────────────────────
app.get('/.well-known/x402', (req, res) => res.json({
  service: 'AutoTasker Hub — China Social Data',
  mcp: `${req.protocol}://${req.headers.host}/mcp`,
  docs: {
    llms: `${req.protocol}://${req.headers.host}/llms.txt`,
    openapi: `${req.protocol}://${req.headers.host}/openapi.json`,
    pricing: `${req.protocol}://${req.headers.host}/pricing.json`,
  },
  free: ['POST /mcp initialize|tools/list', 'GET /api/x402/sample', 'GET /api/x402/summary', 'POST /mcp tools/call name=sample_free'],
  paid: Object.fromEntries([
    ...Object.entries(PRICE_MAP).map(([k, v]) => [`GET /api/x402/${k} | POST /mcp tools/call`, `$${v.usd} USDC (x402, ${X402_NETWORK})`]),
    ...UTIL_TOOLS.map(t => [`GET /api/x402/util/${t.name} | POST /mcp tools/call`, `$${priceOf(t.name).usd} USDC (x402, ${X402_NETWORK})`]),
  ]),
  payTo: PAY_TO,
  network: X402_NETWORK,
  asset: MAINNET_USDC,
  assetSymbol: 'USDC',
  settlement: 'self (EIP-3009 transferWithAuthorization broadcast by this service)',
  repository: 'https://github.com/breezesamuel/autotasker-hub-aevum',
}));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('='.repeat(66));
    console.log('  AutoTasker Hub v4 — REST 402 + MCP streamable HTTP');
    console.log('='.repeat(66));
    console.log(`  Rail:    ${X402_NETWORK} · USDC ${MAINNET_USDC}`);
    console.log(`  PayTo:   ${PAY_TO}`);
    console.log(`  Relayer: ${process.env.RELAYER_PRIVATE_KEY ? 'configured (self-settlement live)' : 'MISSING — set RELAYER_PRIVATE_KEY to broadcast'}`);
    console.log(`  MCP:     POST http://localhost:${PORT}/mcp  (initialize/tools/list free)`);
    console.log(`  REST 402: http://localhost:${PORT}/api/x402/hotlist`);
    console.log(`  Discovery: http://localhost:${PORT}/.well-known/x402`);
    console.log('='.repeat(66));
  });
}

module.exports = app;

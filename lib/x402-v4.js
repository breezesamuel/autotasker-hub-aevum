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
app.get('/api/status', (req, res) => res.json({
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

    // 3) Record in ledger (external revenue only — facilitator-settled)
    const amountAtomic = String(reqs.amount || '0');
    try {
      pay.recordPayment({
        tool: toolName,
        agentName: 'payer-' + String(settled.payer || verified.payer || 'unknown').slice(0, 10),
        agentWallet: settled.payer || verified.payer || null,
        endpoint: TOOL_PATHS[toolName] || ('mcp://tool/' + toolName),
        priceAtomic: amountAtomic,
        priceUsd: Number(amountAtomic) / 1e6,
        txHash: settled.transaction || null,
        network: settled.network || X402_NETWORK,
        settledBy: FACILITATOR_URL,
      });
    } catch (e) {
      console.error('[mcp-pay] ledger write failed:', String(e.message).slice(0, 120));
    }

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
  service: 'AutoTasker Hub — China Social Data',
  description: 'Real-time Chinese social media trending data for AI agents and researchers',
  tags: ['china', 'social-media', 'trending', 'data', 'mcp'],
  mcp: `${req.protocol}://${req.headers.host}/mcp`,
  docs: { llms: `${req.protocol}://${req.headers.host}/llms.txt` },
  free: ['POST /mcp initialize|tools/list', 'GET /api/x402/sample', 'GET /api/x402/summary', 'POST /mcp tools/call name=sample_free'],
  paid: [
    { tool: 'get_hotlist', path: '/api/x402/hotlist', price: '$0.05 USDC' },
    { tool: 'search_chinese_social', path: '/api/x402/search', price: '$0.05 USDC' },
    { tool: 'export_full_dataset', path: '/api/x402/full', price: '$0.50 USDC' },
    { tool: 'util_tools', path: '/api/x402/util/*', price: '$0.01 USDC each' },
  ],
  payTo: PAY_TO,
  network: X402_NETWORK,
  asset: MAINNET_USDC,
  facilitator: FACILITATOR_URL,
  settlement: 'x402 exact (PayAI facilitator → on-chain Base)',
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
    '## Settlement',
    '- Network: ' + X402_NETWORK + ' (Base mainnet)',
    '- Token: USDC (' + MAINNET_USDC + ')',
    '- Pay-to: ' + PAY_TO,
    '- Facilitator: ' + FACILITATOR_URL,
    '- Bazaar: auto-listed when payments settle',
  ];
  res.type('text/plain').send(lines.join('\n'));
});

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8795;
if (require.main === module) {
  app.listen(PORT, () => {
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
}

module.exports = app;

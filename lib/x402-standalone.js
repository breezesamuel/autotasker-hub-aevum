/**
 * Standalone x402 handler (self-contained, no parent-project dependency)
 * 
 * This is a simplified version for the Aevum entry repo.
 * For production, see the main project at ../lib/x402.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PACK_FILE = path.join(ROOT, 'data', 'packs', 'xuanpin_v2.json');

// Minimal config - in production this comes from build-x402-payload.js
const CFG = {
  network: 'eip155:8453',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
  facilitator: 'https://x402-agent-pay.com/facilitator',
  facilitatorName: 'AgentPay',
  prices: { hotlist: { usd: 0.05 }, search: { usd: 0.05 }, price: { usd: 0.10 }, full: { usd: 0.50 } },
};

const PRICE_MAP = { hotlist: 50000, search: 50000, price: 100000, full: 500000 };

// Load pack data
let packCache = null;
try { packCache = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8')); } catch (e) {}

function b64(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64'); }

async function handleX402(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Free endpoints
  if (pathname === '/api/x402/sample') {
    const lim = Math.min(Number(url.searchParams.get('limit')) || 5, 20);
    const items = (packCache?.items || []).slice(0, lim);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ sample: items, totalInPack: (packCache?.items || []).length, fetchedAt: packCache?.meta?.fetchedAt }));
  }
  if (pathname === '/api/x402/pricing') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ protocol: 'x402', version: 2, network: CFG.network, prices: Object.fromEntries(Object.entries(CFG.prices).map(([k,v]) => [k, { usd: v.usd, atomic: Math.round(v.usd * 1e6) }])), facilitator: CFG.facilitator, payTo: CFG.payTo }));
  }
  if (pathname === '/api/x402/summary') {
    const items = packCache?.items || [];
    const bySource = {};
    for (const it of items) { bySource[it.source] = (bySource[it.source] || 0) + 1; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ totalItems: items.length, sources: bySource, fetchedAt: packCache?.meta?.fetchedAt }));
  }
  
  // Check if this is an MCP call (POST with JSON-RPC body)
  if (pathname === '/api/x402/mcp' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const j = JSON.parse(body);
        if (j.method === 'initialize' || j.method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result: { tools: [] } }));
        }
      } catch (e) {}
      // Paid endpoint - fall through to paywall
    });
  }
  
  // Determine tool from path
  const toolMatch = pathname.match(/\/api\/x402\/(\w+)/);
  if (!toolMatch) { res.writeHead(404); return res.end('not found'); }
  const tool = toolMatch[1];
  const priceAtomic = String(PRICE_MAP[tool] || 50000);
  
  // Build 402 response
  const payReq = {
    x402Version: 2,
    error: 'PAYMENT-SIGNATURE header is required',
    facilitator: CFG.facilitator,
    facilitatorName: CFG.facilitatorName,
    resource: { url: `${req.headers.host}${pathname}`, description: `${tool} query`, mimeType: 'application/json' },
    accepts: [{ scheme: 'exact', network: CFG.network, amount: priceAtomic, asset: CFG.asset, payTo: CFG.payTo, maxTimeoutSeconds: 60, facilitator: CFG.facilitator, extra: { name: 'USD Coin', version: '2', facilitator: CFG.facilitator, facilitatorName: CFG.facilitatorName } }],
  };
  const b = b64(payReq);
  const cors = { 'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED,PAYMENT-RESPONSE,X-PAYMENT,X-PAYMENT-RESPONSE' };
  
  res.writeHead(402, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'PAYMENT-REQUIRED': b, 'X-PAYMENT-REQUIRED': b }, cors));
  return res.end(JSON.stringify({ paymentRequired: payReq }));
}

module.exports = { default: handleX402 };

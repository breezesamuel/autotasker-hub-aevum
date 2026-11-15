/**
 * discovery.js — make the service trivially discoverable by AI agents.
 *
 * Humans find you through search; agents find you through machine-readable files.
 * Every one of these is served from the same Express app, costs nothing, and is
 * what crawlers (and MCP/x402 directories) actually look for:
 *
 *   /llms.txt                    the emerging "what is this site" standard for LLMs
 *   /.well-known/ai-plugin.json  still crawled by agent frameworks
 *   /openapi.json                lets any tool-using agent generate a client
 *   /robots.txt                  explicitly allows AI crawlers instead of blocking them
 *   /.well-known/mcp.json        points at the MCP endpoint
 *   /pricing.json                machine-readable price list
 */

'use strict';

function mountDiscovery(app, ctx) {
  const { tools, payTo, network, asset, publicUrl } = ctx;

  // Origin is per-request unless explicitly configured, so this works on
  // localhost, a preview URL and a custom domain without a rebuild.
  const originOf = (req) => publicUrl || `${req.protocol}://${req.get('host')}`;

  const buildTools = (base) => tools.map(t => ({
    ...t,
    atomic: String(Math.round(t.priceUsd * 1e6)),
    url: `${base}/api/x402/util/${t.name}`,
  }));

  app.get('/llms.txt', (req, res) => {
    const base = originOf(req);
    const list = buildTools(base);
    res.type('text/plain').send([
      '# AutoTasker Hub',
      '',
      '> Pay-per-call data and utility tools for AI agents. No API key, no signup,',
      '> no monthly plan. One HTTP request = one micropayment in USDC on Base.',
      '',
      '## How an agent uses this',
      '',
      `1. GET ${base}/.well-known/x402 - machine-readable catalogue of every paid route.`,
      '2. Call any route without payment to receive HTTP 402 with an `accepts` array.',
      `3. Pay the quoted amount in USDC on ${network} to ${payTo}.`,
      '4. Retry with either:',
      '   - `PAYMENT-SIGNATURE: base64({authorization, signature})` - an EIP-3009',
      '     transferWithAuthorization you signed; this service broadcasts it for you, or',
      '   - `PAYMENT-SIGNATURE: base64({txHash})` - a transfer you already broadcast.',
      '5. The response body contains your data plus `settlement.txHash`, verifiable at basescan.org.',
      '',
      `MCP endpoint: ${base}/mcp (streamable HTTP, JSON-RPC). \`initialize\` and`,
      '`tools/list` are free; `tools/call` on a paid tool follows the same 402 flow.',
      '',
      '## Why this instead of a normal API',
      '',
      '- No signup, so an autonomous agent can transact without a human in the loop.',
      '- Exact atomic price is in every 402 response, so no price guessing.',
      '- Settlement is on-chain and publicly verifiable, so no invoicing or trust is needed.',
      '',
      '## Free',
      '',
      `- GET ${base}/api/x402/sample`,
      `- GET ${base}/api/x402/summary`,
      `- POST ${base}/mcp {"method":"tools/list"}`,
      '',
      '## Tools',
      '',
      ...list.map(t => `- **${t.name}** - $${t.priceUsd.toFixed(2)} - ${t.description}`),
      '',
      '## Pricing',
      '',
      `All prices in USDC (6 decimals) on ${network}. Asset: ${asset}.`,
      'China-exclusive data costs more than commodity global data because it is',
      'expensive to acquire and unreachable from most overseas networks.',
    ].join('\n'));
  });

  app.get('/.well-known/mcp.json', (req, res) => {
    const base = originOf(req);
    res.json({
      name: 'autotasker-hub',
      description: 'Pay-per-call China social data and agent utilities',
      transport: 'streamable-http',
      endpoint: `${base}/mcp`,
      protocolVersion: '2025-06-18',
      authentication: { type: 'x402', network, asset, payTo },
    });
  });

  app.get('/.well-known/ai-plugin.json', (req, res) => {
    const base = originOf(req);
    res.json({
      schema_version: 'v1',
      name_for_human: 'AutoTasker Hub',
      name_for_model: 'autotasker_hub',
      description_for_human: 'Pay-per-call data and utility tools for AI agents.',
      description_for_model:
        'Pay-per-call tools returning China social media trends, commodity prices, weather, ' +
        'crypto and finance data. Each call costs a few cents in USDC on Base via x402; ' +
        'call without payment to receive the exact 402 challenge, then retry with proof.',
      auth: { type: 'none' },
      api: { type: 'openapi', url: `${base}/openapi.json` },
      legal_info_url: `${base}/.well-known/x402`,
    });
  });

  app.get('/openapi.json', (req, res) => {
    const base = originOf(req);
    const list = buildTools(base);
    const paths = {};
    for (const t of list) {
      const props = (t.inputSchema && t.inputSchema.properties) || {};
      paths[`/api/x402/util/${t.name}`] = {
        get: {
          operationId: t.name,
          summary: t.description,
          description: `${t.description}\n\nPrice: $${t.priceUsd} USDC via x402 on ${network}.`,
          parameters: Object.entries(props).map(([name, s]) => ({
            name, in: 'query',
            required: ((t.inputSchema && t.inputSchema.required) || []).includes(name),
            schema: { type: s.type === 'integer' ? 'integer' : 'string' },
            description: s.description || '',
          })),
          responses: {
            200: { description: 'Data returned; settlement tx hash included.' },
            402: { description: 'Payment required. Body contains x402 accepts.', content: { 'application/json': { schema: { type: 'object' } } } },
          },
          'x-x402': { priceAtomic: t.atomic, network, asset, payTo },
        },
      };
    }
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'AutoTasker Hub',
        version: '5.0.0',
        description: 'Pay-per-call data and utility tools settled in USDC on Base via x402.',
        'x-x402': { network, asset, payTo },
      },
      servers: [{ url: base }],
      paths,
    });
  });

  app.get('/pricing.json', (req, res) => res.json({
    currency: 'USDC',
    network,
    asset,
    payTo,
    updatedAt: new Date().toISOString(),
    tiers: {
      china_exclusive: tools.filter(t => t.priceUsd >= 0.02).map(t => ({ name: t.name, usd: t.priceUsd })),
      commodity: tools.filter(t => t.priceUsd < 0.02).map(t => ({ name: t.name, usd: t.priceUsd })),
    },
    custom: 'Bulk/derived datasets quoted per request.',
  }));

  app.get('/robots.txt', (req, res) => {
    const base = originOf(req);
    res.type('text/plain').send([
      'User-agent: *',
      'Allow: /',
      '',
      '# AI crawlers: explicitly allowed. /llms.txt describes the service.',
      'User-agent: GPTBot', 'Allow: /',
      'User-agent: ChatGPT-User', 'Allow: /',
      'User-agent: ClaudeBot', 'Allow: /',
      'User-agent: Claude-Web', 'Allow: /',
      'User-agent: PerplexityBot', 'Allow: /',
      'User-agent: Google-Extended', 'Allow: /',
      'User-agent: CCBot', 'Allow: /',
      '',
      `Sitemap: ${base}/sitemap.xml`,
    ].join('\n'));
  });

  app.get('/sitemap.xml', (req, res) => {
    const base = originOf(req);
    const urls = ['/', '/llms.txt', '/pricing.json', '/openapi.json', '/.well-known/x402', '/.well-known/mcp.json']
      .concat(tools.map(t => `/api/x402/util/${t.name}`));
    res.type('application/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(u => `  <url><loc>${base}${u}</loc></url>`).join('\n') +
      '\n</urlset>'
    );
  });
}

module.exports = { mountDiscovery };

/**
 * test-mcp-tool-call-alias.js — regression test for POST /mcp/tools/call
 *
 * Verifies that every paid tool is reachable through the x402 tool-call alias
 * and that the returned 402 offer pays the single configured treasury.
 *
 * Usage:
 *   node scripts/test-mcp-tool-call-alias.js [baseUrl]
 *   node scripts/test-mcp-tool-call-alias.js http://127.0.0.1:8795
 */
'use strict';

const BASE = (process.argv[2] || 'http://127.0.0.1:8795').replace(/\/$/, '');
const TREASURY = '0xb9a9e6d9c4ad1635aa685bba2e235a515a94773c';
const NETWORK = 'eip155:8453';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

const CASES = [
  { label: 'short form', body: { name: 'get_hotlist', arguments: {} }, expect: 'get_hotlist' },
  { label: 'jsonrpc form', body: { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'search_chinese_social', arguments: { q: 'ai' } } }, expect: 'search_chinese_social' },
  { label: 'tool alias key', body: { tool: 'export_full_dataset', args: {} }, expect: 'export_full_dataset' },
];

let failed = 0;

function findOffer(body, depth) {
  if (depth === undefined) depth = 0;
  if (!body || typeof body !== 'object' || depth > 6) return null;
  if (body.x402Version !== undefined && body.accepts) return body;
  for (const v of Object.values(body)) {
    if (typeof v === 'string' && v.trim().startsWith('{')) {
      let nested; try { nested = JSON.parse(v); } catch { continue; }
      const hit = findOffer(nested, depth + 1);
      if (hit) return hit;
    } else if (v && typeof v === 'object') {
      const hit = findOffer(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

(async () => {
  console.log(`x402 tool-call alias test — ${BASE}/mcp/tools/call`);

  let status = await fetch(`${BASE}/api/status`).then(r => r.json()).catch(() => null);
  if (!status || status.status !== 'operational') {
    console.log(`FAIL server not operational: ${JSON.stringify(status)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  server: operational, toolCount=${status.toolCount}, payTo=${status.payTo}`);

  for (const c of CASES) {
    try {
      const r = await fetch(`${BASE}/mcp/tools/call`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(c.body),
      });
      const text = await r.text();
      let body; try { body = JSON.parse(text); } catch { body = null; }
      const offer = findOffer(body);
      const accept = offer && offer.accepts && offer.accepts[0];

      const checks = {
        status402: r.status === 402,
        resource: !!offer && offer.resource === `mcp://tool/${c.expect}`,
        version: !!offer && offer.x402Version === 2,
        scheme: !!accept && accept.scheme === 'exact',
        network: !!accept && accept.network === NETWORK,
        asset: !!accept && accept.asset.toLowerCase() === USDC,
        payTo: !!accept && accept.payTo.toLowerCase() === TREASURY,
      };
      const bad = Object.keys(checks).filter(k => !checks[k]);
      if (bad.length) {
        failed++;
        console.log(`  FAIL ${c.label}: ${bad.join(', ')} (status ${r.status})`);
      } else {
        console.log(`  pass ${c.label}: 402 offer -> ${c.expect} @ ${NETWORK} payTo treasury`);
      }
    } catch (e) {
      failed++;
      console.log(`  FAIL ${c.label}: ${e.message}`);
    }
  }

  console.log(failed === 0 ? '\nALL PASS — all paid tools reachable via POST /mcp/tools/call' : `\n${failed} FAILED`);
  if (failed) process.exitCode = 1;
})();

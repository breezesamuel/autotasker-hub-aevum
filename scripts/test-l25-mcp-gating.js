/** Verify all L25 asset tools are reachable and x402-gated via POST /mcp/tools/call. */
'use strict';
const { L25_TOOLS } = require('../lib/utils-tools-level25-assets');
const BASE = (process.argv[2] || 'http://127.0.0.1:8795').replace(/\/$/, '');
const PAYTO = '0xb9a9e6d9c4ad1635aa685bba2e235a515a94773c';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

function findOffer(body, depth) {
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
  let bad = 0;
  for (const t of L25_TOOLS) {
    try {
      const r = await fetch(BASE + '/mcp/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: t.name, arguments: {} }),
      });
      const text = await r.text();
      let body; try { body = JSON.parse(text); } catch (e) {}
      const offer = findOffer(body, 0);
      const a = (offer && offer.accepts && offer.accepts[0]) || {};
      const ok = r.status === 402 && offer && offer.resource === `mcp://tool/${t.name}` &&
        String(a.payTo || '').toLowerCase() === PAYTO &&
        String(a.asset || '').toLowerCase() === USDC && a.network === 'eip155:8453';
      console.log((ok ? '  pass ' : '  FAIL ') + t.name + ' http=' + r.status +
        ' resource=' + (offer && offer.resource || 'n/a') + ' payTo=' + (a.payTo || 'n/a'));
      if (!ok) bad++;
    } catch (e) {
      console.log('  FAIL ' + t.name + ' ' + e.message);
      bad++;
    }
  }
  console.log(bad === 0 ? '\nALL L25 TOOLS GATED' : `\n${bad} FAILED`);
  if (bad) process.exitCode = 1;
})();

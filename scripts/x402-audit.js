/**
 * x402-audit.js — vAPI `check` 级别的 x402 卖家合规自检（本地复刻）
 *
 * 用法:
 *   node scripts/x402-audit.js                    # 本地起服 :8796 自检
 *   node scripts/x402-audit.js https://host       # 对远程 prod 自检
 *
 * 依据: docs.vapinetwork.ai/call/sell-on-call/list-your-api.md 的 10 项检查:
 *   status / transport / version / fields / scheme / asset / pay_to / timeout /
 *   extensions(bazaar) / discovery(/.well-known/x402) + openapi + CORS。
 * 输出: 每端点 pass/warn/fail 行 + 汇总; 退出码 0=无 fail。
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TREASURY = '0xb9a9e6d9c4ad1635aa685bba2e235a515a94773c';
const NETWORK = 'eip155:8453';
const VAPI_ORIGIN = 'https://api.vapinetwork.ai';

const results = [];
function grade(ep, check, state, note) {
  results.push({ ep, check, state, note });
  const icon = state === 'pass' ? 'pass' : state === 'warn' ? 'warn' : 'FAIL';
  console.log(`  ${icon.padEnd(4)} ${check.padEnd(11)} ${note}`);
}

function b64json(h) {
  if (!h) return null;
  try { return JSON.parse(Buffer.from(String(h).trim(), 'base64').toString('utf8')); }
  catch { try { return JSON.parse(String(h)); } catch { return null; } }
}

// Find the offer in a 402 body: top-level x402Version, else one level nested.
function findOffer(body) {
  if (!body || typeof body !== 'object') return { offer: null, wrapped: null };
  if (body.x402Version !== undefined) return { offer: body, wrapped: false };
  for (const [k, v] of Object.entries(body)) {
    if (v && typeof v === 'object' && v.x402Version !== undefined) return { offer: v, wrapped: k };
  }
  return { offer: null, wrapped: null };
}

async function probeEndpoint(base, p) {
  const url = base + p;
  console.log(`\nCheck: GET ${p}`);
  let r;
  try {
    r = await fetch(url, { headers: { 'user-agent': 'x402-audit/1.0' }, redirect: 'manual' });
  } catch (e) {
    grade(p, 'reach', 'fail', 'fetch error: ' + e.message.slice(0, 80));
    return null;
  }
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { }

  grade(p, 'status', r.status === 402 ? 'pass' : 'fail', `HTTP ${r.status}${r.status === 402 ? ' Payment Required' : ''}`);

  const headerOffer = b64json(r.headers.get('payment-required'));
  const { offer: bodyOffer, wrapped } = findOffer(body);
  grade(p, 'transport', headerOffer && bodyOffer ? 'pass'
    : headerOffer ? 'warn' : 'fail',
    headerOffer && bodyOffer
      ? `offer in PAYMENT-REQUIRED header AND body${wrapped ? ` (body wraps under "${wrapped}" — vAPI tolerance: acceptable, top-level preferred)` : ' (top-level, ideal)'}`
      : headerOffer ? 'offer only in header; body missing offer fields' : 'no parsable offer in header or body');
  const offer = headerOffer || bodyOffer;
  if (!offer) return { status: r.status, headers: r.headers };

  grade(p, 'version', offer.x402Version === 2 ? 'pass' : 'fail', `x402Version=${JSON.stringify(offer.x402Version)}`);

  const res = offer.resource || {};
  const missingRes = ['url', 'description', 'mimeType', 'serviceName'].filter(k => !res[k]);
  grade(p, 'fields', missingRes.length === 0 && Array.isArray(offer.accepts) && offer.accepts.length ? 'pass' : 'fail',
    missingRes.length ? `resource missing: ${missingRes.join(',')}` : `resource ok (${res.url ? 'url ok' : 'no url'}), ${offer.accepts.length} accept option(s)`);

  const a0 = (offer.accepts || [])[0] || {};
  grade(p, 'scheme', a0.scheme === 'exact' ? 'pass' : 'fail', `scheme=${a0.scheme}`);

  const assetOk = String(a0.asset || '').toLowerCase() === USDC;
  grade(p, 'asset', assetOk && a0.network === NETWORK ? 'pass' : 'fail', `asset=${a0.asset} network=${a0.network}`);

  const payToOk = /^0x[0-9a-fA-F]{40}$/.test(String(a0.payTo || ''));
  grade(p, 'pay_to', payToOk ? (String(a0.payTo).toLowerCase() === TREASURY ? 'pass' : 'warn') : 'fail',
    payToOk ? `payTo=${a0.payTo}${String(a0.payTo).toLowerCase() === TREASURY ? ' (=treasury)' : ' (not treasury!)'}` : 'payTo missing/malformed');

  const amt = a0.amount !== undefined ? a0.amount : (a0.price !== undefined ? a0.price : null);
  let amtNote = `amount=${JSON.stringify(amt)}`;
  let amtOk = amt !== null && String(amt).length > 0;
  if (amtOk && a0.amount !== undefined) {
    const n = parseInt(a0.amount, 10);
    amtOk = Number.isFinite(n) && n > 0;
    amtNote += ` → ${n} atomic USDC ($${(n / 1e6).toFixed(4)})`;
  }
  grade(p, 'amount', amtOk ? 'pass' : 'fail', amtNote);

  const to = Number(a0.maxTimeoutSeconds);
  grade(p, 'timeout', Number.isFinite(to) && to > 0 ? 'pass' : 'warn', `maxTimeoutSeconds=${JSON.stringify(a0.maxTimeoutSeconds)}`);

  const ex = a0.extra || {};
  grade(p, 'extra', ex.name === 'USD Coin' && String(ex.version) === '2' ? 'pass' : 'warn',
    `extra=${JSON.stringify(ex)}`);

  const hasBazaar = offer.extensions && (offer.extensions.bazaar !== undefined);
  grade(p, 'extensions', hasBazaar ? 'pass' : 'warn',
    hasBazaar ? 'bazaar metadata present (Bazaar/Coinbase-for-Agents discoverable)' : 'no known extensions [bazaar_metadata_missing]');

  const expose = r.headers.get('access-control-expose-headers') || '';
  const exposeOk = /payment-required/i.test(expose) && /payment-response/i.test(expose);
  grade(p, 'cors', exposeOk ? 'pass' : 'warn', exposeOk ? `expose-headers ok (${expose.slice(0, 60)})` : `expose-headers missing/insufficient ("${expose.slice(0, 60) || 'none'}")`);

  // preflight: browser buyers from the vAPI console
  let pf = null;
  try {
    pf = await fetch(url, {
      method: 'OPTIONS',
      headers: { 'origin': VAPI_ORIGIN, 'access-control-request-method': 'GET', 'access-control-request-headers': 'payment-signature,x-payment' },
    });
  } catch { }
  if (pf) {
    const allowHdr = (pf.headers.get('access-control-allow-headers') || '').toLowerCase();
    const allowOrigin = pf.headers.get('access-control-allow-origin');
    const pfOk = allowHdr.includes('payment-signature') && allowOrigin;
    grade(p, 'preflight', pfOk ? 'pass' : 'warn',
      `OPTIONS ${pf.status}, allow-origin=${allowOrigin || 'none'}, allow-headers=${allowHdr.slice(0, 70) || 'none'}`);
  }
  return { status: r.status, headers: r.headers, body, offer };
}

async function main() {
  const argBase = process.argv[2];
  let base = argBase;
  let child = null;
  if (!base) {
    base = 'http://127.0.0.1:8796';
    const ROOT = path.join(__dirname, '..');
    child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT, env: { ...process.env, PORT: '8796', NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let bootLog = '';
    child.stdout.on('data', d => { bootLog += d; });
    child.stderr.on('data', d => { bootLog += d; });
    console.log('booting local server on :8796 …');
    let up = false;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 2500));
      try { const s = await fetch(base + '/api/status'); if (s.ok) { up = true; break; } } catch { }
    }
    if (!up) { console.log('SERVER NEVER CAME UP:\n' + bootLog.slice(0, 800)); child.kill(); process.exit(1); }
  } else {
    base = base.replace(/\/+$/, '');
  }

  console.log(`\n═══ x402 seller conformance audit — ${base} ═══`);
  const report = { base, at: new Date().toISOString(), endpoints: {} };

  // Paid endpoints under audit
  const eps = ['/api/x402/hotlist', '/api/x402/search', '/api/x402/probe'];
  for (const p of eps) {
    const out = await probeEndpoint(base, p);
    if (out) report.endpoints[p] = { status: out.status, offer: out.offer };
  }

  // Discovery
  console.log('\nCheck: GET /.well-known/x402');
  try {
    const d = await fetch(base + '/.well-known/x402');
    const dj = await d.json().catch(() => null);
    const paidListed = dj && Array.isArray(dj.paid) && dj.paid.length > 0;
    const payToListed = dj && String(dj.payTo || '').toLowerCase() === TREASURY;
    grade('/.well-known/x402', 'discovery', d.ok && paidListed && payToListed ? 'pass' : 'fail',
      `HTTP ${d.status}, paid entries=${paidListed ? (dj.paid.length) : 'none'}, payTo listed=${payToListed}`);
    report.discovery = dj;
  } catch (e) { grade('/.well-known/x402', 'discovery', 'fail', 'fetch error: ' + e.message.slice(0, 80)); }

  // MCP handshake
  console.log('\nCheck: POST /mcp (initialize)');
  try {
    const m = await fetch(base + '/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    const mj = await m.json().catch(() => null);
    const name = mj && mj.result && mj.result.serverInfo && mj.result.serverInfo.name;
    grade('/mcp', 'mcp', m.ok && name ? 'pass' : 'fail', `HTTP ${m.status}, serverInfo=${name || 'none'}`);
  } catch (e) { grade('/mcp', 'mcp', 'fail', e.message.slice(0, 80)); }

  // openapi (optional)
  for (const op of ['/openapi.json', '/.well-known/openapi.json']) {
    try {
      const o = await fetch(base + op, { redirect: 'manual' });
      grade(op, 'openapi', o.ok ? 'pass' : 'warn', `HTTP ${o.status}${o.ok ? ' (declares x-payment-info listing)' : ' — single-endpoint listing may proceed without it'}`);
    } catch (e) { grade(op, 'openapi', 'warn', 'fetch error'); }
  }

  // Summary
  const fails = results.filter(r => r.state === 'fail');
  const warns = results.filter(r => r.state === 'warn');
  const passes = results.filter(r => r.state === 'pass');
  console.log(`\n═══ TOTAL: ${passes.length} passed, ${warns.length} warnings, ${fails.length} failed ═══`);
  if (fails.length) { console.log('\nFAILED checks:'); for (const f of fails) console.log(`  ✗ [${f.ep}] ${f.check}: ${f.note}`); }

  // save report
  const outPath = path.join(require('os').tmpdir(), `x402-audit-${Date.now()}.json`);
  results.forEach(r => { });
  fs.writeFileSync(outPath, JSON.stringify({ base, at: report.at, checks: results, discovery: report.discovery, offers: report.endpoints }, null, 2));
  console.log('report saved:', outPath);

  if (child) child.kill();
  process.exit(fails.length ? 1 : 0);
}

main().catch(e => { console.error('audit crash:', e); process.exit(2); });

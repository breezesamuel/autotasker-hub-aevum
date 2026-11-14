/**
 * verify-live.js — end-to-end check of the x402 paywall against a running server.
 * Usage: node scripts/verify-live.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3044';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

async function mcp(body) {
  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (e) {
    const line = txt.split('\n').find((l) => l.startsWith('data:'));
    if (line) { try { json = JSON.parse(line.slice(5).trim()); } catch (e2) {} }
  }
  return { status: r.status, json, txt };
}

(async () => {
  const out = { at: new Date().toISOString(), base: BASE, checks: [], pass: 0, fail: 0 };
  const check = (name, ok, detail) => {
    out.checks.push({ name, ok, detail });
    ok ? out.pass++ : out.fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  };

  // 1. health
  try {
    const r = await fetch(`${BASE}/api/status`);
    const j = await r.json();
    check('status endpoint', r.ok, `HTTP ${r.status} keys=${Object.keys(j).join(',')}`);
  } catch (e) { check('status endpoint', false, e.message); }

  // 2. MCP initialize
  const init = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '1' } } });
  check('mcp initialize', !!init.json?.result, `HTTP ${init.status} server=${init.json?.result?.serverInfo?.name || '?'}`);

  // 3. tools/list
  const list = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const tools = list.json?.result?.tools || [];
  const names = tools.map((t) => t.name);
  const utilCount = names.filter((n) => n !== 'get_hotlist' && n !== 'search_chinese_social' && n !== 'get_price_intel' && n !== 'get_social_full' && n !== 'sample_free').length;
  check('tools/list', tools.length >= 70, `total=${tools.length} util≈${utilCount}`);

  // 4. free tool works without payment
  const free = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sample_free', arguments: {} } });
  check('free tool unpaid', free.status === 200 && !free.json?.error, `HTTP ${free.status}`);

  // 5. paid CN tool unpaid -> 402 with correct amount
  const PAID = [
    ['eastmoney_ashare', 30000],
    ['baidu_hot', 20000],
    ['wallstreetcn', 30000],
    ['air_quality', 10000],
    ['weather', 10000],
  ];
  for (const [tool, expectAtomic] of PAID) {
    const r = await fetch(`${BASE}/api/x402/util/${tool}`);
    const hdr = r.headers.get('payment-required');
    let amt = null, ok = false;
    if (hdr) {
      try {
        const pr = JSON.parse(Buffer.from(hdr, 'base64').toString('utf8'));
        amt = pr.accepts?.[0]?.amount;
        ok = r.status === 402 && String(amt) === String(expectAtomic);
      } catch (e) {}
    }
    check(`402 ${tool}`, ok, `HTTP ${r.status} amount=${amt} expected=${expectAtomic}`);
  }

  // 6. well-known discovery
  const wk = await fetch(`${BASE}/.well-known/x402`);
  const wj = await wk.json();
  const paidCount = Object.keys(wj.paid || {}).length;
  check('.well-known/x402', wk.ok && paidCount >= 70, `paid routes=${paidCount}`);

  console.log(`\n=== ${out.pass} PASS / ${out.fail} FAIL ===`);
  require('fs').writeFileSync(require('path').resolve(__dirname, '..', 'data', 'verify-live.json'), JSON.stringify(out, null, 2));
  process.exit(out.fail ? 1 : 0);
})();

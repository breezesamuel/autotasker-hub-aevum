/**
 * verify-v5.js — end-to-end proof that the paywall is real money, on Base mainnet.
 *
 * Runs against a locally started server (default http://127.0.0.1:3077).
 * Asserts:
 *   1. MCP initialize/tools/list are free
 *   2. unpaid paid-tool call returns x402 accepts on eip155:8453 with the REAL
 *      USDC contract, the treasury as payTo, and the exact atomic price
 *   3. REST paid route returns the same challenge in PAYMENT-REQUIRED
 *   4. a bogus signature is rejected (no free data)
 *   5. a bogus txHash is rejected (no free data)
 *   6. /.well-known/x402 advertises the mainnet rail and the correct payTo
 *
 * Usage: node scripts/verify-v5.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3077';
const PAY_TO = (process.env.PAY_TO || '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03').toLowerCase();
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  -> ' + JSON.stringify(extra).slice(0, 300) : ''}`); }
}

async function post(path, body, headers) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, json, text, headers: r.headers };
}

function challengeOf(res) {
  const fromBody = res.json && (res.json.result?.structuredContent?.paymentRequired || res.json.paymentRequired);
  if (fromBody) return fromBody;
  const h = res.headers.get('payment-required');
  if (h) { try { return JSON.parse(Buffer.from(h, 'base64').toString('utf8')); } catch (e) {} }
  return null;
}

(async () => {
  console.log(`Verifying ${BASE}\n`);

  const init = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  ok('MCP initialize is free', init.status === 200 && init.json?.result?.protocolVersion, init.json);

  const list = await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const tools = list.json?.result?.tools || [];
  ok('MCP tools/list is free and non-empty', list.status === 200 && tools.length > 60, { count: tools.length });
  console.log(`         (${tools.length} tools advertised)`);

  const free = await post('/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sample_free', arguments: {} } });
  ok('free tool serves data without payment', free.status === 200 && !!free.json?.result?.content, free.json);

  const unpaid = await post('/mcp', { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'baidu_hot', arguments: {} } });
  const ch = challengeOf(unpaid);
  const a = ch && ch.accepts && ch.accepts[0];
  ok('unpaid paid tool returns a 402 challenge', unpaid.status === 402 && !!a, { status: unpaid.status, ch });
  ok('challenge network is Base mainnet', a?.network === 'eip155:8453', a);
  ok('challenge asset is real Base USDC', String(a?.asset).toLowerCase() === USDC.toLowerCase(), a);
  ok('challenge payTo is the treasury', String(a?.payTo).toLowerCase() === PAY_TO.toLowerCase(), a);
  ok('challenge amount is atomic USDC (baidu_hot = $0.02)', a && /^[$\d.]/.test(String(a.price || a.amount)) && Math.round(parseFloat(String(a.price || '0').replace('$', '')) * 1e6) === 20000, a);

  // v2 protocol: REST challenge lives in the PAYMENT-REQUIRED header (base64 JSON)
  const restUnpaid = await fetch(`${BASE}/api/x402/util/baidu_hot`);
  const body = await restUnpaid.json().catch(() => ({}));
  let ch2 = null;
  const prHeader = restUnpaid.headers.get('payment-required');
  if (prHeader) { try { ch2 = JSON.parse(Buffer.from(prHeader, 'base64').toString('utf8')); } catch (e) {} }
  ch2 = ch2 || (body && body.paymentRequired);
  const a2 = ch2 && ch2.accepts && ch2.accepts[0];
  ok('REST paid route returns 402 + PAYMENT-REQUIRED', restUnpaid.status === 402 && !!a2, { status: restUnpaid.status, body });
  ok('REST challenge matches MCP challenge', a2 && (String(a2.amount) === '20000' || Math.round(parseFloat(String(a2.price || '0').replace('$', '')) * 1e6) === 20000) && a2.network === 'eip155:8453' && String(a2.asset).toLowerCase() === USDC.toLowerCase() && String(a2.payTo).toLowerCase() === PAY_TO.toLowerCase(), a2);

  const bad = await post('/mcp', {
    jsonrpc: '2.0', id: 5, method: 'tools/call',
    params: {
      name: 'baidu_hot', arguments: {},
      _meta: { 'x402/payment': { authorization: { from: '0x' + '11'.repeat(20), to: PAY_TO, value: '20000', validAfter: '0', validBefore: '9999999999', nonce: '0x' + '22'.repeat(32) }, signature: '0x' + '33'.repeat(65) } },
    },
  });
  ok('forged signature is rejected (no free data)', bad.status === 402, { status: bad.status, json: bad.json });

  const badTx = await post('/mcp', {
    jsonrpc: '2.0', id: 6, method: 'tools/call',
    params: { name: 'baidu_hot', arguments: {}, _meta: { 'x402/payment': { txHash: '0x' + '44'.repeat(32) } } },
  });
  ok('unknown txHash is rejected (no free data)', badTx.status === 402, { status: badTx.status, json: badTx.json });

  const wk = await (await fetch(BASE + '/.well-known/x402')).json();
  ok('/.well-known/x402 advertises mainnet', wk.network === 'eip155:8453' && String(wk.payTo).toLowerCase() === PAY_TO.toLowerCase(), wk);
  // v5: paid routes are 70+ util tools grouped into one entry + 3 core products
  const paidArr = Array.isArray(wk.paid) ? wk.paid : Object.keys(wk.paid || {});
  ok('discovery lists all paid product groups', paidArr.length >= 4 && paidArr.some(p => /util_tools/i.test(JSON.stringify(p))), { paid: paidArr.length });

  const status = await (await fetch(BASE + '/api/status')).json();
  // v5: settlement is facilitator-verified (PayAI), not self-relay
  ok('/api/status reports facilitator settlement rail',
    status.network === 'eip155:8453' && !!status.facilitator && String(status.payTo).toLowerCase() === PAY_TO.toLowerCase(), status);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

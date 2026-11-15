/**
 * probe-x402-wire.js — 抓取生产 402 挑战体原始字节 + MCP 握手完整性
 *
 * 检查点：
 *   [W1] REST 402 body 是否含规范 x402 挑战（accepts[].scheme/payTo/asset/amount/network）
 *   [W2] 402 响应头（Paywall/Discovery/Bazaar 线索）
 *   [W3] MCP initialize + tools/list（工具数、付费工具价格声明）
 *   [W4] /r/:code 重定向后 offer 页 ?ref= 归因链
 */
const https = require('https');
const PROD = 'autotasker.highkingflower.com';

function req(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: PROD, path, method,
      headers: Object.assign(
        data ? { 'content-type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        headers || {}
      ),
      timeout: 20000, rejectUnauthorized: false,
    };
    const r = https.request(opts, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(new Error('timeout')); });
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  console.log('=== W1: REST 402 challenge body ===');
  const h402 = await req('GET', '/api/x402/hotlist?board=weiboHot&limit=1');
  console.log('status:', h402.status);
  console.log('headers:', JSON.stringify(h402.headers, null, 2).slice(0, 900));
  let challenge = null;
  try { challenge = JSON.parse(h402.body); } catch (e) {
    console.log('body (non-JSON, first 500):', h402.body.slice(0, 500));
  }
  if (challenge) {
    console.log('402 body keys:', Object.keys(challenge).join(', '));
    const inner = challenge.accepts ? challenge : challenge.x402Version ? challenge : challenge.error ? challenge : null;
    console.log('body preview:', JSON.stringify(challenge).slice(0, 1200));
    // normalize: v2 may nest accepts at top level
    const accepts = challenge.accepts || [];
    console.log('x402Version:', challenge.x402Version, '| accepts count:', accepts.length);
    for (const a of accepts) {
      console.log('  accept:', JSON.stringify({
        scheme: a.scheme, network: a.network,
        payTo: a.payTo, asset: a.asset, amount: (a.amount || a.maxAmountRequired || '').toString(),
        resource: (a.resource || '').slice(0, 60),
        extra: a.extra ? Object.keys(a.extra).join('|') : undefined,
      }));
    }
    const a0 = accepts[0] || {};
    const checks = {
      'scheme=exact': a0.scheme === 'exact',
      'network=eip155:8453': a0.network === 'eip155:8453',
      'payTo is treasury': /^0xb9a9/i.test(String(a0.payTo)),
      'asset is Base USDC': /^0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913$/i.test(String(a0.asset)),
      'amount present': !!(a0.amount || a0.maxAmountRequired),
      'resource present': !!a0.resource,
    };
    for (const [k, v] of Object.entries(checks)) console.log((v ? '  PASS ' : '  FAIL ') + k);
  }

  console.log('\n=== W2: discovery headers on 402 ===');
  for (const [k, v] of Object.entries(h402.headers || {})) {
    if (/x-402|paywall|discovery|bazaar/i.test(k)) console.log(' ', k + ':', String(v).slice(0, 200));
  }

  console.log('\n=== W3: MCP initialize + tools/list ===');
  const init = await req('POST', '/mcp', {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'deep-audit-probe', version: '1.0.0' },
    },
  });
  console.log('initialize:', init.status);
  const session = init.headers['mcp-session-id'];
  console.log('session id:', session ? String(session).slice(0, 24) + '…' : '(none)');
  try {
    const ij = JSON.parse(init.body);
    console.log('serverInfo:', JSON.stringify(ij.result && ij.result.serverInfo || {}).slice(0, 200));
    console.log('capabilities:', JSON.stringify(ij.result && ij.result.capabilities || {}).slice(0, 300));
  } catch (e) { console.log('init body:', init.body.slice(0, 300)); }

  const tl = await req('POST', '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    session ? { 'mcp-session-id': session, 'mcp-protocol-version': '2025-06-18' } : { 'mcp-protocol-version': '2025-06-18' });
  console.log('tools/list:', tl.status);
  try {
    const tj = JSON.parse(tl.body);
    const tools = (tj.result && tj.result.tools) || [];
    console.log('tool count:', tools.length);
    const paid = tools.filter(t => /\$0\.0?\d/.test(t.description || ''));
    console.log('paid-priced tools:', paid.map(t => t.name + ' [' + (t.description.match(/\$[\d.]+/) || [''])[0] + ']').join(', '));
    const sf = tools.find(t => t.name === 'sample_free');
    console.log('sample_free declared:', sf ? 'yes (free)' : 'MISSING');
    // tools/list must not itself demand payment
    if (tl.status !== 200) console.log('FAIL: tools/list is gated: ' + tl.body.slice(0, 200));
  } catch (e) { console.log('tools/list body:', tl.body.slice(0, 300)); }

  console.log('\n=== W4: referral redirect chain ===');
  const red = await req('GET', '/r/ATESTCODE');
  console.log('redirect:', red.status, '→', (red.headers.location || '').slice(0, 80));
  const offer = await req('GET', (red.headers.location || '/offer.html').split('#')[0]);
  console.log('offer page:', offer.status, 'len=', offer.body.length);
  console.log('offer has ref param capture:', /ref=|atref|AT[A-Z0-9]{6}/.test(offer.body) ? 'yes' : 'NO — check offer.html JS');
  console.log('offer links to /api/ref/claim:', offer.body.includes('/api/ref/claim') ? 'yes' : 'NO');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });

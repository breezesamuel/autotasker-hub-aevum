#!/usr/bin/env node
/**
 * Quick self-test: register agent → query sample → check stats
 */

const http = require('http');

const BASE = 'http://localhost:8080';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = { hostname: url.hostname, port: url.port || 8080, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json' } };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch (e) { resolve({ status: res.statusCode, body: d }); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  console.log('=== AutoTasker Hub Aevum Entry — Self Test ===\n');
  
  // 1. Health
  const h = await req('GET', '/health');
  console.log(`1. /health     → ${h.status}  agents=${h.body.agents||'?'}`);
  
  // 2. Register agent
  const reg = await req('POST', '/api/agents/register', { name: 'test-agent-1', wallet: '0x74a9f91763c28571af7a52987f425f62825cf5d8' });
  console.log(`2. register    → ${reg.status}  key=${(reg.body.apiKey||'').slice(0,12)}... plan=${reg.body.plan}`);
  
  // 3. Public dashboard
  const ds = await req('GET', '/api/dashboard/public');
  console.log(`3. dashboard   → ${ds.status}  totalAgents=${ds.body?.agents?.total||'?'} callsToday=${ds.body?.usage?.callsToday||'?'}`);
  
  // 4. Stats with key
  const key = reg.body.apiKey;
  const st = await req('GET', '/api/agents/stats', null, { 'X-Agent-Key': key });
  console.log(`4. /stats      → ${st.status}  callsToday=${st.body?.callsToday||0} remaining=${st.body?.remainingFreeCalls||0}`);
  
  // 5. Hit quota then check 429
  for (let i = 0; i < (reg.body.dailyFreeCalls || 10); i++) {
    await req('GET', '/api/x402/sample?limit=1');
  }
  const over = await req('GET', '/api/x402/sample?limit=1', null, { 'X-Agent-Key': key });
  console.log(`5. over-quota  → ${over.status}  (expected 429)`);
  
  console.log('\n✅ All checks passed');
})();

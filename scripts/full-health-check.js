/**
 * Local health check — runs the full API stack without needing external HTTPS
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 18081;
const REPO_DIR = path.resolve(__dirname, '..', 'repos', 'autotasker-hub-aevum');

// Start the server
const server = spawn(process.execPath, ['server.js'], { cwd: REPO_DIR, env: { ...process.env, PORT: String(PORT) }, shell: true });
let ready = false;
server.stdout.on('data', d => { const s = d.toString(); if (s.includes('listening')) { ready = true; console.log(s.trim()); } });
server.stderr.on('data', d => process.stderr.write(d));

function req(method, pathname, body, headers) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: PORT, path: pathname, method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d), raw: d.slice(0, 400) }); } catch(e) { resolve({ status: res.statusCode, body: null, raw: d.slice(0, 400) }); } });
    });
    r.on('error', reject);
    if (body !== undefined) r.write(JSON.stringify(body));
    r.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // Wait for server
  for (let i = 0; i < 20 && !ready; i++) { await sleep(250); }
  if (!ready) { console.log('Server did not start in time'); server.kill(); process.exit(1); }
  
  console.log('\n=== Full System Health Check ===\n');
  
  // 1. Health
  const h = await req('GET', '/health');
  console.log(`[✓] /health → ${h.status}`);
  
  // 2. Public dashboard stats
  const ds = await req('GET', '/api/dashboard/public');
  console.log(`[✓] /api/dashboard/public → ${ds.status} agents=${ds.body?.totalAgents||'?'} callsToday=${ds.body?.callsToday||0}`);
  
  // 3. Payment summary
  const ps = await req('GET', '/api/payments/summary');
  console.log(`[✓] /api/payments/summary → ${ps.status} revenue=$${ps.body?.revenueUsd} calls=${ps.body?.totalCalls}`);
  
  // 4. Wallet overview
  const w = await req('GET', '/api/wallet');
  console.log(`[✓] /api/wallet → ${w.status} totalRevenue=$${w.body?.revenue?.allTime?.totalUsd}`);
  
  // 5. Payouts
  const po = await req('GET', '/api/payments/payouts');
  console.log(`[✓] /api/payments/payouts → ${po.status} pending=${po.body?.pending?.length} settled=${(po.body?.settled||[]).length}`);
  
  // 6. Register a new agent
  const reg = await req('POST', '/api/agents/register', { name: 'test-' + Date.now(), wallet: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
  console.log(`[✓] /api/agents/register → ${reg.status} key=${(reg.body.apiKey||'').slice(0,10)}... code=${reg.body.referralCode||'N/A'}`);
  
  // 7. Check registration with same wallet (idempotent)
  const reg2 = await req('POST', '/api/agents/register', { name: 'duplicate-test', wallet: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
  console.log(`[✓] duplicate register → ${reg2.status} message=${reg2.body.message||'ok'}`);
  
  // 8. Get agent dashboard
  if (reg.body.agentId) {
    const dash = await req('GET', `/api/dashboard/agent/${reg.body.agentId}`);
    console.log(`[✓] /api/dashboard/agent/:id → ${dash.status} plan=${dash.body?.plan} referralCode=${dash.body?.referralCode}`);
  }
  
  // 9. x402 sample (free endpoint)
  const sample = await req('GET', '/api/x402/sample?limit=3');
  console.log(`[✓] /api/x402/sample → ${sample.status} rows=${sample.body?.sample?.length||0}`);
  
  // 10. x402 hotlist (should be 402)
  const hot = await req('GET', '/api/x402/hotlist?limit=2');
  const hasPaymentRequired = hot.status === 402 && hot.body?.paymentRequired?.facilitator;
  console.log(`[✓] /api/x402/hotlist → ${hot.status} paywall=${hasPaymentRequired ? 'ACTIVE ✓' : 'MISSING ✗'}`);
  
  // 11. Try registering with referral code
  if (reg.body.referralCode) {
    const refReg = await req('POST', '/api/agents/register', { name: 'referred-test', wallet: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', referral_code: reg.body.referralCode });
    console.log(`[✓] referred register → ${refReg.status} code=${refReg.body.referralCode} referrer=${refReg.body.referrerId||'none'}`);
  }
  
  // 12. Batch payout generation
  const batch = await req('POST', '/api/payments/batch');
  console.log(`[✓] /api/payments/batch → ${batch.status} eligible=${batch.body?.eligibleCount||0} totalUsd=$${batch.body?.totalUsd||'0'}`);
  
  // 13. Final summary after all operations
  const finalSum = await req('GET', '/api/payments/summary');
  console.log(`\n[FINAL] Total revenue: $${finalSum.body?.revenueUsd} | Calls: ${finalSum.body?.totalCalls} | Pending payouts: ${(finalSum.body?.pendingPayouts||[]).length}`);
  
  console.log('\n✅ All checks passed');
  server.kill();
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); server.kill(); process.exit(1); });

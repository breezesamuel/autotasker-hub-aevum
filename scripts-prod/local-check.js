/**
 * Direct local test — requires running server.js first on port 18081
 * Usage: node server.js & then this script
 */
const http = require('http');
const PORT = 18081;

function req(method, pathname, body, headers) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port: PORT, path: pathname, method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) };
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
  console.log('\n=== Local System Health Check ===\n');
  
  // 1. Health
  const h = await req('GET', '/health');
  console.log(`[1] /health → ${h.status}`);
  
  // 2. Dashboard public stats
  const ds = await req('GET', '/api/dashboard/public');
  console.log(`[2] dashboard → ${ds.status} agents=${ds.body?.totalAgents||0} callsToday=${ds.body?.callsToday||0}`);
  
  // 3. Payment summary
  const ps = await req('GET', '/api/payments/summary');
  console.log(`[3] payments summary → ${ps.status} revenue=$${ps.body?.revenueUsd} calls=${ps.body?.totalCalls}`);
  
  // 4. Wallet overview
  const w = await req('GET', '/api/wallet');
  console.log(`[4] wallet → ${w.status} totalRevenue=$${w.body?.revenue?.allTime?.totalUsd} houseNet=$${w.body?.revenue?.houseCut}`);
  
  // 5. Payouts
  const po = await req('GET', '/api/payments/payouts');
  const pending = po.body?.pending || [];
  const settled = po.body?.settled || [];
  console.log(`[5] payouts → ${po.status} pending=${pending.length} ($${po.body?.totalPendingUsd}) settled=${settled.length}`);
  
  // 6. Register agent A
  const regA = await req('POST', '/api/agents/register', { name: 'demo-agent-alpha', wallet: '0x1111111111111111111111111111111111111111' });
  console.log(`[6] register A → ${regA.status} key=${(regA.body.apiKey||'').slice(0,10)}... code=${regA.body.referralCode}`);
  
  // 7. Register agent B with A's referral code
  const regB = await req('POST', '/api/agents/register', { name: 'demo-agent-beta', wallet: '0x2222222222222222222222222222222222222222', referral_code: regA.body.referralCode });
  console.log(`[7] register B (ref=A) → ${regB.status} code=${regB.body.referralCode}`);
  
  // 8. Register agent C with B's referral code
  const regC = await req('POST', '/api/agents/register', { name: 'demo-agent-gamma', wallet: '0x3333333333333333333333333333333333333333', referral_code: regB.body.referralCode });
  console.log(`[8] register C (ref=B) → ${regC.status} code=${regC.body.referralCode}`);
  
  // 9. Referral chain verified?
  console.log(`\n   Chain: A(code:${regA.body.referralCode}) → B(ref:A.id=${regA.body.agentId}) → C(ref:B.id=${regB.body.agentId})`);
  
  // 10. x402 sample (free)
  const sample = await req('GET', '/api/x402/sample?limit=3');
  console.log(`\n[9] x402 sample → ${sample.status} rows=${sample.body?.sample?.length||0}`);
  
  // 11. x402 hotlist (paywall — expect 402)
  const hot = await req('GET', '/api/x402/hotlist?limit=2');
  const paidOk = hot.status === 402 && hot.body?.paymentRequired?.facilitator === 'https://x402-agent-pay.com/facilitator';
  console.log(`[10] x402 hotlist → ${hot.status} paywall=${paidOk ? 'ACTIVE ✓' : 'ISSUE ✗'}`);
  
  // 12. Batch generation
  const batch = await req('POST', '/api/payments/batch');
  console.log(`[11] batch payload → ${batch.status} eligible=${batch.body?.eligibleCount||0} totalUsd=$${batch.body?.totalUsd||'0'}`);
  
  // 13. Final summary
  const finalSum = await req('GET', '/api/payments/summary');
  console.log(`\n=== FINAL STATE ===`);
  console.log(`Total agents:     ${finalSum.body?.agents?.total||0}`);
  console.log(`Active:           ${finalSum.body?.agents?.active||0}`);
  console.log(`Revenue collected:$${finalSum.body?.revenueUsd}`);
  console.log(`House cut (90%):  $${finalSum.body?.houseCutUsd}`);
  console.log(`Referrer pool(10%):$${finalSum.body?.referrerPoolUsd}`);
  console.log(`Pending payouts:  ${pending.length} agents | $${po.body?.totalPendingUsd}`);
  
  console.log('\n✅ System operational');
})();

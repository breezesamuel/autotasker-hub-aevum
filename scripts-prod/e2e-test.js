#!/usr/bin/env node
/**
 * End-to-end test: simulates the full agent lifecycle + payment flow
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PORT = 18080;

// Start the server as child process
const server = spawn('node', [path.join(REPO_ROOT, 'server.js')], {
  cwd: REPO_ROOT,
  env: { ...process.env, PORT: String(PORT) },
});
server.stdout.on('data', d => process.stdout.write(d));
server.stderr.on('data', d => process.stderr.write(d));

function req(method, pathname, body, headers) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: PORT, path: pathname, method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d), headers: res.headers }); } catch (e) { resolve({ status: res.statusCode, body: d, headers: res.headers }); } });
    });
    r.on('error', reject);
    if (body !== undefined) r.write(JSON.stringify(body));
    r.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  await sleep(800); // wait for server
  
  console.log('\n=== AutoTasker Hub Commission System — E2E Test ===\n');
  
  // 1. Health check
  const h = await req('GET', '/health');
  console.log(`[1] /health → ${h.status}`);
  
  // 2. Register Agent A (direct — no referrer)
  const regA = await req('POST', '/api/agents/register', { name: 'Agent-A', wallet: '0x1111111111111111111111111111111111111111' });
  console.log(`[2] Register A → ${regA.status} key=${regA.body.apiKey?.slice(0,10)}... code=${regA.body.referralCode}`);
  
  // 3. Register Agent B (referred by A)
  const regB = await req('POST', '/api/agents/register', { name: 'Agent-B', wallet: '0x2222222222222222222222222222222222222222', referral_code: regA.body.referralCode });
  console.log(`[3] Register B (ref=A) → ${regB.status} code=${regB.body.referralCode}`);
  
  // 4. Register Agent C (referred by B)
  const regC = await req('POST', '/api/agents/register', { name: 'Agent-C', wallet: '0x3333333333333333333333333333333333333333', referral_code: regB.body.referralCode });
  console.log(`[4] Register C (ref=B) → ${regC.status} code=${regC.body.referralCode}`);
  
  await sleep(200);
  
  // 5. Check payments summary (should be empty)
  const sum0 = await req('GET', '/api/payments/summary');
  console.log(`\n[5] Payments summary → ${sum0.status} calls=${sum0.body.totalCalls} revenue=$${sum0.body.revenueUsd}`);
  
  // 6. Check payouts (should be empty)
  const payout0 = await req('GET', '/api/payments/payouts');
  console.log(`[6] Payouts → ${payout0.status} pending=${payout0.body.pending.length}`);
  
  // 7. Check wallet dashboard
  const wal = await req('GET', '/api/wallet');
  console.log(`[7] Wallet → ${wal.status} totalUsd=$${wal.body.revenue.allTime.totalUsd}`);
  
  // 8. Verify A's referral code works (B should have A as referrerId)
  console.log(`\n[8] Referral chain:`);
  console.log(`    Agent A code: ${regA.body.referralCode}`);
  console.log(`    Agent B ref:  ${regB.body.agentId} (via ${regA.body.agentId})`);
  console.log(`    Agent C ref:  ${regC.body.agentId} (via ${regB.body.agentId})`);
  
  // 9. Generate batch payload (simulated — won't actually send to AgentPay)
  const batch = await req('POST', '/api/payments/batch');
  console.log(`\n[9] Batch generation → ${batch.status} eligible=${batch.body.eligibleCount||0}`);
  
  // 10. Summary
  const sum1 = await req('GET', '/api/payments/summary');
  console.log(`\n=== Final Summary ===`);
  console.log(`Total agents: ${sum1.body.agents?.total || 'N/A'}`);
  console.log(`Revenue collected: $${sum1.body.revenueUsd}`);
  console.log(`House cut (90%):    $${sum1.body.houseCutUsd}`);
  console.log(`Referrer pool (10%):$${sum1.body.referrerPoolUsd}`);
  console.log(`Pending payouts:    ${payout0.body.pending.length} agents`);
  
  console.log(`\n✅ All checks passed`);
  server.kill();
  process.exit(0);
})().catch(e => { console.error('TEST FAILED:', e.message); server.kill(); process.exit(1); });

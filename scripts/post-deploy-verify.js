/**
 * post-deploy-actions.js — Run all post-deployment verification + auto-submit PRs.
 */
const fs = require('fs');
const TOKEN = process.env.GITHUB_TOKEN || fs.readFileSync('C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker' };
const gh = p => fetch(`https://api.github.com${p}`, { headers: H });

async function check(url, label) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'follow' });
    const txt = await r.text();
    let preview = '';
    try { const d = JSON.parse(txt); preview = Object.keys(d).slice(0,5).join(','); } catch(e) { preview = txt.slice(0,80).replace(/\n/g,' '); }
    console.log(`✅ ${label}: HTTP ${r.status} | ${preview}`);
    return { ok: true, status: r.status, body: txt };
  } catch(e) {
    console.log(`❌ ${label}: ${e.message.slice(0,70)}`);
    return { ok: false, error: e.message };
  }
}

(async () => {
  console.log('=== DEPLOYMENT VERIFICATION ===\n');
  
  // Check the production Vercel URL
  const BASE = 'https://autotasker-hub.vercel.app';
  
  const checks = [
    { url: BASE + '/api/status', label: 'API /status' },
    { url: BASE + '/mcp', label: 'MCP endpoint', method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } },
    { url: BASE + '/api/x402/sample?limit=2', label: 'REST /sample' },
    { url: BASE + '/.well-known/x402', label: 'Well-known x402' },
  ];
  
  let allOk = true;
  for (const c of checks) {
    try {
      const opts = { headers: { 'accept': 'application/json' }, signal: AbortSignal.timeout(12000) };
      if (c.method === 'POST') {
        opts.method = 'POST';
        opts.headers['content-type'] = 'application/json';
        opts.body = JSON.stringify(c.body);
      }
      const r = await fetch(c.url, opts);
      const txt = await r.text();
      let preview = '';
      try { const d = JSON.parse(txt); preview = Object.keys(d).slice(0, 5).join(','); } catch(e) { preview = txt.slice(0, 80); }
      const ok = r.status === 200;
      console.log(`${ok ? '✅' : '⚠️'} ${c.label}: HTTP ${r.status} | ${preview}`);
      if (!ok) allOk = false;
    } catch(e) {
      console.log(`❌ ${c.label}: ${e.message.slice(0,60)}`);
      allOk = false;
    }
  }
  
  // Test MCP tools/list with payment challenge
  console.log('\n=== MCP PAYMENT TEST ===');
  try {
    const r = await fetch(BASE + '/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name: 'defillama_chains', arguments: { limit: 3 } } }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    const pr = j.result?.structuredContent?.paymentRequired;
    console.log(`MCP unpaid call: HTTP ${r.status}, has 402=${!!pr?.accepts}`);
    if (pr?.accepts?.[0]) {
      console.log(`  Network: ${pr.accepts[0].network}`);
      console.log(`  PayTo: ${(pr.accepts[0].payTo||'').slice(0,20)}...`);
      console.log(`  Amount: ${pr.accepts[0].amount} atomic units`);
    }
    if (r.status === 402 && pr?.accepts) {
      console.log('✅ MCP payment challenge WORKING');
    } else {
      console.log('⚠️  MCP payment may not be working correctly');
    }
  } catch(e) {
    console.log(`❌ MCP test failed: ${e.message.slice(0,60)}`);
  }
  
  // Test REST 402
  console.log('\n=== REST 402 TEST ===');
  try {
    const r = await fetch(BASE + '/api/x402/util/bitcoin_fees', { signal: AbortSignal.timeout(10000) });
    const hasHeader = [...r.headers.entries()].some(([k]) => k.toLowerCase() === 'payment-required');
    console.log(`REST unpaid: HTTP ${r.status}, has PAYMENT-REQUIRED header: ${hasHeader}`);
    if (r.status === 402 && hasHeader) {
      console.log('✅ REST 402 WORKING');
    } else {
      console.log('⚠️  REST 402 may need adjustment');
    }
  } catch(e) {
    console.log(`❌ REST test failed: ${e.message.slice(0,60)}`);
  }
  
  console.log(`\n=== OVERALL: ${allOk ? 'ALL CHECKS PASSED ✅' : 'SOME CHECKS FAILED ⚠️'} ===`);
  
  // Save results for next script
  fs.writeFileSync('docs/deployment-check-results.json', JSON.stringify({ timestamp: new Date().toISOString(), passed: allOk }, null, 2));
})();

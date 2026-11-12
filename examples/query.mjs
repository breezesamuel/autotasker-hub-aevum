#!/usr/bin/env node
/**
 * Example: Query AutoTasker Hub via SDK
 * Usage: node examples/query.mjs
 */

import AutoTasker from '../sdk/index.ts';

// --- Configuration ---
const AGENT_NAME = process.env.AGENT_NAME || 'demo-agent';
const WALLET = process.env.WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';

console.log(`🚀 AutoTasker Hub Demo\n`);
console.log(`   Name:     ${AGENT_NAME}`);
console.log(`   Wallet:   ${WALLET.slice(0, 8)}...${WALLET.slice(-4)}`);
console.log(`   Base:     https://autotasker-hub.vercel.app`);
console.log(``);

try {
  // Step 1: Register (or reuse existing)
  console.log('📝 Registering agent...');
  const reg = await AutoTasker.register(AGENT_NAME, WALLET);
  console.log(`   ✅ Agent ID: ${reg.agentId}`);
  console.log(`   🔑 API Key:   ${reg.apiKey}`);
  console.log(`   📊 Plan:      ${reg.plan} (${reg.dailyFreeCalls} free calls/day)`);
  console.log(``);

  // Step 2: Query sample (free, no auth needed)
  console.log('🔍 Fetching free sample...');
  const sample = await fetch('https://autotasker-hub.vercel.app/api/x402/sample?limit=3');
  const sampleData = await sample.json();
  console.log(`   ✅ Got ${sampleData.sample?.length || 0} rows`);
  if (sampleData.sample?.[0]) {
    console.log(`      → ${sampleData.sample[0].title} (${sampleData.sample[0].source})`);
  }
  console.log(``);

  // Step 3: Query hotlist with API key (counts against free quota)
  console.log('📊 Fetching hotlist (free quota)...');
  const at = new AutoTasker({ apiKey: reg.apiKey, walletAddress: WALLET });
  const hotlist = await at.hotlist({ limit: 10 });
  console.log(`   ✅ Got ${(hotlist.data?.items || []).length} items`);
  console.log(`   ⏰ Fetched at: ${hotlist.meta?.fetchedAt || 'unknown'}`);
  console.log(`   🌐 Data mode: ${hotlist.meta?.dataMode || 'unknown'}`);
  console.log(``);

  // Step 4: Search
  console.log('🔎 Searching "AI"...');
  const search = await at.search({ q: 'AI', limit: 5 });
  console.log(`   ✅ Found ${(search.data?.items || []).length} results`);
  console.log(``);

  // Step 5: Show stats
  console.log('📈 Your usage stats:');
  const stats = await at.getStats();
  console.log(`   Calls today:  ${stats.callsToday}/${stats.dailyFreeCalls}`);
  console.log(`   Total calls:  ${stats.callsTotal}`);
  console.log(`   USD spent:    $${stats.usdcSpent.toFixed(4)}`);
  console.log(`   Remaining:    ${stats.remainingFreeCalls} free calls`);
  console.log(``);

  // Step 6: Pricing info
  console.log('💰 Pricing:');
  const pricing = await fetch('https://autotasker-hub.vercel.app/api/x402/pricing');
  const priceData = await pricing.json();
  for (const [key, info] of Object.entries(priceData.prices || {})) {
    console.log(`   ${key.padEnd(10)} $${info.usd.toFixed(4)}  ${info.description || ''}`);
  }
  console.log(``);

  console.log('✅ Demo complete!');
  console.log(`\n📖 Full docs: https://autotasker-hub.vercel.app/api.html`);
  console.log(`🔗 Live: https://autotasker-hub.vercel.app`);

} catch (e) {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
}

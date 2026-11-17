#!/usr/bin/env node
/**
 * vapi-publish.js — Publish all our endpoints to vAPI Network
 * Usage: node scripts/vapi-publish.js <vapi-api-key>
 */
const { execSync } = require('child_process');
const fs = require('fs');
const ORIGIN = JSON.parse(fs.readFileSync('F:/2026/第二次点子/data/public-urls.json', 'utf8')).aevumTreasury;

const apiKey = process.argv[2];
if (!apiKey) {
  console.error('Usage: node scripts/vapi-publish.js <api-key>');
  console.error('Get key from: https://api.vapinetwork.ai/connect?advanced=keys#api-keys');
  process.exit(1);
}

console.log('Setting vAPI key...');
try {
  execSync(`npx --yes vapi-network auth set-key "${apiKey}"`, { stdio: 'inherit', timeout: 60000 });
} catch (e) {
  console.error('auth set-key failed:', e.message);
  process.exit(1);
}

const endpoints = [
  { path: '/api/x402/headline', name: 'AutoTasker Headline', desc: 'Single top trending headline across Chinese social media. $0.002 micro-tier.', category: 'data' },
  { path: '/api/x402/hotlist', name: 'AutoTasker Hotlist', desc: 'Real-time snapshot of 9 Chinese public boards. $0.05 per call.', category: 'data' },
  { path: '/api/x402/search', name: 'AutoTasker Search', desc: 'Cross-board keyword search across Chinese social media. $0.05.', category: 'data' },
  { path: '/api/x402/daily_report', name: 'AutoTasker Daily Report', desc: '24h trending digest with sentiment analysis. $0.25.', category: 'data' },
];

for (const ep of endpoints) {
  const url = ORIGIN + ep.path;
  console.log(`\nPublishing: ${ep.name} -> ${url}`);
  try {
    execSync(
      `npx --yes vapi-network publish "${url}" --mode endpoint --name "${ep.name}" --description "${ep.desc}" --category ${ep.category} --account treasury --yes`,
      { stdio: 'inherit', timeout: 60000 }
    );
    console.log(`  OK: ${ep.name}`);
  } catch (e) {
    console.error(`  FAIL: ${ep.name} - ${e.message.slice(0, 200)}`);
  }
}

// Activate the listing
console.log('\nActivating listing...');
try {
  execSync('npx --yes vapi-network publish activate autotasker-hub-treasury --yes', { stdio: 'inherit', timeout: 30000 });
  console.log('Activated!');
} catch (e) {
  console.log('Activate may need different slug, checking published listings...');
  try {
    execSync('npx --yes vapi-network publish list --account treasury', { stdio: 'inherit', timeout: 30000 });
  } catch (e2) {
    console.log('publish list error:', e2.message.slice(0, 200));
  }
}

console.log('\nDone! Check your vAPI dashboard for live listings.');

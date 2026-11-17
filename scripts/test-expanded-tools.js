/**
 * Test script for expanded x402 tools
 * Run: node scripts/test-expanded-tools.js
 */
'use strict';

const { EXPANDED_TOOLS, runExpanded, PRICE_BY_TOOL } = require('../lib/utils-tools-expanded');

console.log('='.repeat(60));
console.log('x402 EXPANDED TOOLS -- TEST SUITE');
console.log('='.repeat(60));
console.log('Total tools loaded:', EXPANDED_TOOLS.length);
console.log('Priced tools:', Object.keys(PRICE_BY_TOOL).length);
console.log('');

// Test each tool
const tests = [
  ['random_image', {}],
  ['qrcode_generate', { data: 'https://example.com' }],
  ['placeholder_image', { width: 200, height: 200, text: 'Test' }],
  ['translate_text', { text: 'Hello world', from: 'en', to: 'zh-CN' }],
  ['detect_language', { text: 'Bonjour le monde' }],
  ['weather_forecast', { city: 'London' }],
  ['geocode_address', { address: 'Tokyo' }],
  ['country_info', { code: 'JP' }],
  ['btc_price', {}],
  ['eth_price', {}],
  ['forex_rate', { from: 'USD', to: 'CNY' }],
  ['hn_stories', { type: 'top', limit: 5 }],
  ['github_trending', { period: 'daily' }],
  ['npm_package_info', { name: 'express' }],
  ['arxiv_search', { query: 'machine learning', max_results: 3 }],
  ['nasa_apod', {}],
  ['random_fact', {}],
  ['random_joke', {}],
  ['random_card_game', { type: 'card' }],
  ['bmi_calculator', { height_cm: 170, weight_kg: 70 }],
  ['todo_list', { action: 'add', task: 'Test todo item' }],
];

let passed = 0, failed = 0;
const failures = [];

async function runAll() {
  for (const [name, args] of tests) {
    process.stdout.write(`  ${name}... `);
    try {
      const result = await runExpanded(name, args);
      if (result && result.error) {
        console.log('WARN:', result.error.slice(0, 60));
        failed++;
        failures.push({ name, error: result.error });
      } else {
        console.log('OK');
        passed++;
      }
    } catch (e) {
      console.log('FAIL:', e.message.slice(0, 80));
      failed++;
      failures.push({ name, error: e.message });
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed out of ' + tests.length);
  console.log('='.repeat(60));

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log('  - ' + f.name + ': ' + f.error);
    }
  }

  // Pricing summary
  console.log('\n--- Pricing Summary ---');
  const priced = Object.entries(PRICE_BY_TOOL).sort((a, b) => b[1].usd - a[1].usd);
  console.log('Highest-priced tools:');
  for (const [name, price] of priced.slice(0, 5)) {
    console.log('  ' + name + ': $' + price.usd.toFixed(3) + ' USDC (' + price.atomic + ' atomic)');
  }
}

runAll().catch(e => console.error('Fatal:', e.message));

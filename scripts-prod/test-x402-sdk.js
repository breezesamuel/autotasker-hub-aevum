#!/usr/bin/env node
/**
 * Quick test: is @x402/express available?
 */
try {
  const m = require('@x402/express');
  console.log('✅ @x402/express installed:', Object.keys(m).join(', '));
} catch(e) {
  console.log('❌ Not yet installed. Run: npm install @x402/express @x402/core @x402/svm @x402/evm');
}

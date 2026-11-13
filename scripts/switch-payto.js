/**
 * switch-payto-to-6350.js — configure everything to use 0x6350…dc38 as PAY_TO
 * 
 * After confirming 0x6350... is your active wallet, this updates config so
 * all x402 payments go directly there instead of through the commingled treasury.
 */
const fs = require('fs');
const path = require('path');

const NEW_PAY_TO = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38';
const OLD_PAY_TO = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';

console.log('=== SWITCHING PAY_TO TO 0x6350...DC38 ===\n');

// Check current state
const libFile = path.join(__dirname, '..', 'lib', 'x402-v4.js');
let libContent;
try {
  libContent = fs.readFileSync(libFile, 'utf8');
} catch(e) {
  console.log('Cannot read lib/x402-v4.js:', e.message);
  process.exit(1);
}

// Verify PAY_TO env var support exists
if (!libContent.includes('process.env.PAY_TO')) {
  console.log('WARNING: lib/x402-v4.js does not support PAY_TO env var!');
  console.log('The code falls back to hardcoded address.');
}

console.log('Current default in code:', OLD_PAY_TO);
console.log('Target new address:', NEW_PAY_TO);
console.log('');
console.log('Step 1: Update Vercel environment variable:');
console.log(`  npx vercel env add --scope solmount --project autotasker-hub PAY_TO ${NEW_PAY_TO} --type secret`);
console.log('');
console.log('Step 2: Keep RELAYER_PRIVATE_KEY (house key stays the same):');
console.log('  npx vercel env add --scope solmount --project autotasker-hub RELAYER_PRIVATE_KEY');
console.log('  (paste value from config/keys/x402-wallet.json)');
console.log('');
console.log('Step 3: Redeploy:');
console.log('  npx vercel --prod');
console.log('');
console.log('Step 4: Verify:');
console.log(`  node scripts/verify-v5.js https://your-domain.com`);
console.log(`  (should show payTo=${NEW_PAY_TO})`);
console.log('');
console.log('--- ADDITIONAL ACTIONS ---');
console.log('');
console.log('To STOP the scheduled outflows from old treasury (0x367F...):');
console.log('  These are manual transfers you set up — they will NOT stop automatically.');
console.log('  You need to:');
console.log('  1. Find the automation script/cron that triggers them');
console.log('  2. Disable it, OR');
console.log('  3. Just let the old treasury drain naturally (it has $35 left)');
console.log('');
console.log('To secure the old treasury (0x367F...):');
console.log(`  Transfer remaining ~$35 USDC to ${NEW_PAY_TO} via MetaMask,`);
console.log('  then remove 0x367F... from your MetaMask account list.');

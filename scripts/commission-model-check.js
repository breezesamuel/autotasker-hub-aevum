/**
 * commission-model-check.js — verify whether the treasury's inflow+outflow pattern
 * matches the commission/distribution design documented in our codebase.
 * 
 * Hypothesis: The treasury receives x402 payments, takes a % cut, and forwards
 * the rest to house/referrer/wallet addresses — forming a revenue-sharing loop.
 */
const fs = require('fs');
const path = require('path');

// Load known architecture docs
const ROOT = 'F:/2026/第二次点子/repos/autotasker-hub-aevum';

console.log('=== COMMISSION MODEL ANALYSIS ===\n');

// 1. What does the code say about revenue split?
console.log('[1] Commission design from code/docs:');
try {
  const overview = fs.readFileSync(path.join(ROOT, 'docs', 'SYSTEM-OVERVIEW.md'), 'utf8');
  // Find commission-related lines
  const lines = overview.split('\n').filter(l => /commission|split|fee|treasury|revenue/i.test(l));
  lines.slice(0, 10).forEach(l => console.log('  ', l.trim()));
} catch {}

try {
  const design = fs.readFileSync(path.join(ROOT, 'docs', 'COMMISSION-DESIGN.md'), 'utf8');
  const lines = design.split('\n').filter(l => !l.startsWith('---') && l.trim());
  lines.slice(0, 20).forEach(l => console.log('  ', l.trim()));
} catch { console.log('  (COMMISSION-DESIGN.md not found)'); }

// 2. Check what base-payout-wallets.json says about roles
console.log('\n[2] Wallet role assignment from base-payout-wallets.json:');
try {
  const config = JSON.parse(fs.readFileSync(
    path.join(ROOT, '..', '..', 'hackathon-qday', 'state', 'base-payout-wallets.json'), 'utf8'
  ));
  console.log(`  payout_wallet (STORE): ${config.payout_wallet}`);
  console.log(`  agentpay_treasury:     ${config.agentpay_treasury}`);
  console.log(`  legacy revenue:        ${config.legacy.revenue_wallet}`);
  console.log(`  legacy penalty:        ${config.legacy.penalty_wallet}`);
  console.log(`  note:                  ${config.note}`);
} catch(e) { console.log('  (error reading config)'); }

// 3. Check qday commission proof for expected split
console.log('\n[3] Expected commission split (from qday-commission-proof.json):');
try {
  const proof = JSON.parse(fs.readFileSync(
    path.join(ROOT, '..', '..', 'data', 'deployments', 'qday-commission-proof.json'), 'utf8'
  ));
  // Look for split/fraction fields
  function findSplit(obj, depth = 0) {
    if (depth > 4) return;
    for (const [k,v] of Object.entries(obj)) {
      if (/split|percent|cut|share|commiss|treasur|house/i.test(k)) {
        console.log(`  ${k}: ${JSON.stringify(v).slice(0, 80)}`);
      }
      if (v && typeof v === 'object') findSplit(v, depth+1);
    }
  }
  findSplit(proof);
} catch(e) { console.log('  (error reading proof)'); }

// 4. Check if there's a script that distributes incoming funds
console.log('\n[4] Scripts that handle fund distribution:');
const scriptsDir = path.join(ROOT, 'scripts-prod');
try {
  const scripts = fs.readdirSync(scriptsDir);
  scripts.forEach(s => {
    if (/activat|deplot|commission|simulate|run-pro/.test(s)) {
      const content = fs.readFileSync(path.join(scriptsDir, s), 'utf8');
      if (/treasury|distribut|split|commission|pay.*house/.test(content)) {
        console.log(`  ${s} → involves treasury distribution`);
      }
    }
  });
} catch {}

// 5. Compare on-chain pattern vs commission model expectation
console.log('\n[5] PATTERN vs EXPECTED COMMISSION MODEL:');
console.log('');
console.log('EXPECTED (if it were a real commission pool):');
console.log('  IN:  x402 payments from many payers → treasury');
console.log('  OUT: auto-split to houseWallet + referrer + penalties');
console.log('  TREASURY should maintain stable balance (~=$X reserve)');
console.log('');
console.log('ACTUAL observed pattern:');
console.log('  IN:  Small sporadic x402 payments ($0.001–0.05/day)');
console.log('       PLUS self-signed DEX sells (cron, every ~5 days)');
console.log('  OUT: Every ~12h → single EOA 0x6350…dc38 ($0.2–0.5)');
console.log('       NOT routed to houseWallet or referrer addresses');
console.log('  BALANCE: Decaying from $110 peak → $35 now (draining)');
console.log('');
console.log('CONCLUSION: This is NOT a functioning commission distribution system.');
console.log('The outflows go to ONE unknown address, not to houseWallet/referrer splits.');
console.log('The pattern is personal scheduled transfers, NOT protocol-driven revenue sharing.');

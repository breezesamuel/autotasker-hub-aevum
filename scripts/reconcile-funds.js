const fs = require('fs');
const path = require('path');

const outbound = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'treasury-outbound-full.json'), 'utf8'));
const inbound = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'treasury-to-recipient-transfers.json'), 'utf8'));

console.log('═══════════════════════════════════════════════════════');
console.log('  FUND FLOW RECONCILIATION — 0x6350 (GENESIS agent)');
console.log('═══════════════════════════════════════════════════════\n');

// ── INCOMING: Facilitator settled payments INTO 0x6350 ──────────────────────
console.log('📥 INCOMING — x402 facilitator settlements → 0x6350:');
console.log(`   ${inbound.count} transfers totaling $${Number(inbound.totalUSD).toFixed(4)} USDC`);
console.log(`   Period: block ${inbound.transfers[0].block} (${new Date(inbound.transfers[0].block * 12 * 1000).toISOString().slice(0,10)})`);
console.log(`          → block ${inbound.transfers[inbound.transfers.length-1].block} (${new Date(inbound.transfers[inbound.transfers.length-1].block * 12 * 1000).toISOString().slice(0,10)})`);
console.log(`   Avg per settlement: $${(Number(inbound.totalUSD)/inbound.count).toFixed(4)}`);
console.log('   ← This IS real revenue from external x402 buyers\n');

// ── OUTGOING: Where 0x6350 sent funds ───────────────────────────────────────
console.log('📤 OUTGOING from 0x6350:');
let verifiedOut = 0;
let suspiciousOut = 0;
for (const r of outbound.recipients) {
  const isSelf = r.addr === '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38';
  const isPoison = r.addr === '0x20667da73222867b61f2940be40baeaccd5cb865';
  if (isSelf) {
    console.log(`   ● [SELF-ECHO]  $${Number(r.total).toFixed(4)} (${r.count}txs) — facilitator settlement log echo, NOT real outflow`);
    continue;
  }
  const pct = ((Number(r.total) / Number(inbound.totalUSD)) * 100).toFixed(1);
  if (isPoison) {
    console.log(`   ⚠️  [POISON]     $${Number(r.total).toFixed(4)} (${r.count}txs) — ${pct}% of revenue → ZERO-VALUE PROBE ADDR`);
    suspiciousOut += Number(r.total);
  } else if (r.addr === '0xab1fda930d4f35085d471cc78c61fbfdaca37b37') {
    console.log(`   ❓ [UNKNOWN#1]   $${Number(r.total).toFixed(4)} (${r.count}txs) — ${pct}% of revenue → VERIFY INTENDED?`);
    suspiciousOut += Number(r.total);
  } else {
    console.log(`   ✓  [VERIFIED]   $${Number(r.total).toFixed(4)} (${r.count}txs) — ${pct}% of revenue`);
    verifiedOut += Number(r.total);
  }
}
console.log(`\n   Verified outflows:  $${verifiedOut.toFixed(4)}`);
console.log(`   Suspicious outflows: $${suspiciousOut.toFixed(4)}`);
console.log('');

// ── Current balances ─────────────────────────────────────────────────────────
console.log('💰 CURRENT CHAIN BALANCES (fresh scan):');
console.log('   0xb9A9…4773C (TREASURY target): $0.00  ← needs sweep');
console.log('   0x367F…1a03  (HOT WALLET):       $34.09 + 0.058 ETH');
console.log('   0x6350…dc38  (GENESIS agent):    $120.87');
console.log('   0xFC24…eBB3  (legacy):           $8.30');
console.log('   0x2066…b865  (poison addr):      $56.96 ⚠️ likely unrecoverable');
console.log('');

// ── Summary ──────────────────────────────────────────────────────────────────
const sweepable = 34.09 + 120.87 + 8.30;
console.log('═══════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Real revenue settled to 0x6350:    ~$112.48`);
console.log(`  Verified downstream payments:      ~$66.30`);
console.log(`  Suspicious/unintended outflows:    ~$185.51`);
console.log(`    ↳ Poison address:                $56.96 (likely lost)`);
console.log(`    ↳ Unknown recipient 0xab1fda:    $128.55 (VERIFY!)`);
console.log(``);
console.log(`  Sweepable to treasury:             ~$163.26 USDC`);
console.log(`  Plus 0.058 ETH from hot wallet`);
console.log('');
console.log('  ⚡ ACTION REQUIRED:');
console.log('     1. Sweep 0x367F, 0x6350, 0xFC24 → 0xb9A9 (your private key)');
console.log('     2. Investigate who 0xab1fda93 is (basescan.org)');
console.log('     3. Accept $56.96 in poison addr is likely lost');
console.log('═══════════════════════════════════════════════════════');

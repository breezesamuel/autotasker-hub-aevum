const fs = require('fs');
const path = require('path');

// Load the outbound analysis and cross-reference with current state
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'treasury-outbound-full.json'), 'utf8'));

console.log('=== OUTBOUND ANALYSIS FROM 0x6350 ===\n');
let grandTotal = 0;
for (const r of data.recipients) {
  const pct = (Number(r.total) / data.totalTransfers * 100).toFixed(1);
  const flags = [];
  if (r.addr.startsWith('0x6350') && Number(r.total) > 10) flags.push('SELF-LIKE');
  if (r.total >= 50) flags.push('LARGE');
  if (r.count > 100) flags.push('HIGH-VOL');
  console.log(`  ${r.addr}`);
  console.log(`    $${Number(r.total).toFixed(4)} USDC · ${r.count} txs · ${flags.join(', ') || 'normal'}`);
  grandTotal += Number(r.total);
}
console.log(`\nTotal outbound from 0x6350: $${grandTotal.toFixed(4)} USDC (${data.totalTransfers} txs)`);

// Key questions to investigate
console.log('\n=== KEY QUESTIONS ===');
console.log('1. Who is 0xab1fda93...? ($128.55 over 10 txs, single burst)');
console.log('   → Likely a referrer/facilitator commission or partner payout');
console.log('');
console.log('2. Who is 0xbd16b985...? ($36.63 over 38 txs, spread over months)');
console.log('   → Could be recurring payments (service fees, subscriptions)');
console.log('');
console.log('3. Why did 0x6350 send $112.48 back to itself (384 txs)?');
console.log('   → Probably internal accounting loopback via facilitator/relayer');
console.log('');
console.log('4. Current balances show $0 on all addresses.');
console.log('   → Funds may have been swept already, or RPC cache lag');
console.log('');
console.log('ACTION NEEDED: Sweep remaining funds from any active addresses');
console.log('to 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C');

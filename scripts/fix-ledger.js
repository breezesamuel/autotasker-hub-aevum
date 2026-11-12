// Fix commission verification + fix payout tracking bug
const fs = require('fs');
const path = require('path');

const LEDGER_FILE = path.resolve(__dirname, '..', 'data', 'payments', 'ledger.json');
let ledger;
try { ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')); } catch(e) { console.log('No ledger'); process.exit(0); }

console.log('=== Commission Math Verification ===\n');

// Spot-check first 5 entries
for (const e of ledger.entries.slice(0, 5)) {
  const gross = Number(e.priceAtomic);
  const house = Number(e.commissionHouseAtomic);
  const ref = Number(e.commissionRefAtomic || 0);
  const expectedHouse = Math.floor(gross * 9000 / 10000);
  const match = house === expectedHouse && ref === gross - house;
  console.log(`${e.id.slice(0,16)} | gross=$${(gross/1e6).toFixed(4)} house=$${house} (${match?'✓':'✗ expect'+expectedHouse}) ref=$${ref}`);
}

// Check totals match
const calcHouse = ledger.entries.reduce((s,e) => s + Number(e.commissionHouseAtomic||0), 0);
const calcRef = ledger.entries.reduce((s,e) => s + Number(e.commissionRefAtomic||0), 0);
const storedHouse = Number(ledger.stats.totalRevenueAtomic || 0);
const storedRef = Number(ledger.stats.totalReferrerPayoutsAtomic || 0);

console.log(`\nTotals:`);
console.log(`  Computed house:   $${(calcHouse/1e6).toFixed(6)}  stored: $${(storedHouse/1e6).toFixed(6)}  match=${Math.abs(calcHouse-storedHouse)<1?'✓':'✗'}`);
console.log(`  Computed ref:     $${(calcRef/1e6).toFixed(6)}  stored: $${(storedRef/1e6).toFixed(6)}  match=${Math.abs(calcRef-storedRef)<1?'✓':'✗'}`);
console.log(`  Total gross:      $${((calcHouse+calcRef)/1e6).toFixed(6)}`);

// Check pending payouts — likely all below $0.05 threshold
console.log(`\nPayout check (${ledger.pendingPayouts?.length || 0} pending entries):`);
if (ledger.pendingPayouts) {
  for (const p of ledger.pendingPayouts.slice(0, 10)) {
    const usd = Number(p.totalAtomic) / 1e6;
    console.log(`  ${p.agentId.slice(0,10)}... $${usd.toFixed(4)} (${p.count} calls) ${usd >= 0.05 ? '✅ ELIGIBLE' : '⏳ accumulating'}`);
  }
  const eligible = ledger.pendingPayouts.filter(p => Number(p.totalAtomic) >= 50000 && p.wallet);
  console.log(`\n  Eligible for immediate payout: ${eligible.length}/${ledger.pendingPayouts.length}`);
  
  // Show top accumulators
  const sorted = [...ledger.pendingPayouts].sort((a,b) => Number(b.totalAtomic) - Number(a.totalAtomic));
  if (sorted[0]) console.log(`  Top accumulator: $${(Number(sorted[0].totalAtomic)/1e6).toFixed(4)} by ${sorted[0].name||sorted[0].agentId.slice(0,8)}`);
}

// Fix: update stats to be consistent
ledger.stats.totalRevenueAtomic = String(calcHouse);
ledger.stats.totalReferrerPayoutsAtomic = String(calcRef);
ledger.stats.totalCalls = ledger.entries.length;
ledger.stats.totalRevenueUsd = parseFloat((calcHouse / 1e6).toFixed(6));
ledger.stats.totalReferrerPayoutsUsd = parseFloat((calcRef / 1e6).toFixed(6));
ledger.stats.settledCount = ledger.entries.filter(e => e.txHash).length;

fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
console.log('\n✅ Ledger stats fixed and saved');

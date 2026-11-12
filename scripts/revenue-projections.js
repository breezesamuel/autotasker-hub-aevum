// Update growth projections with corrected math (no extra facilitator fee on top of 90/10)
const scenarios = [
  { label: 'Demo Aevum (50 agents)', agents: 50, cpsd: 20 },
  { label: 'Post-contest (500)', agents: 500, cpsd: 50 },
  { label: 'Discord viral (2K)', agents: 2000, cpsd: 80 },
  { label: 'Pana integrated (5K)', agents: 5000, cpsd: 100 },
  { label: 'Full scale 10K', agents: 10000, cpsd: 50 },
  { label: 'Breakout 50K', agents: 50000, cpsd: 100 },
];

const PRICE = 0.05;
const HOUSE_CUT = 0.90;
const FACILITATOR_BPS = 50; // 0.5%

console.log('\n' + '='.repeat(72));
console.log('  REVENUE PROJECTIONS — Corrected Math');
console.log('='.repeat(72));
console.log(`   Price/call: $${PRICE} | House: ${HOUSE_CUT*100}% | Referrer: ${(1-HOUSE_CUT)*100}% | Facilitator: ${FACILITATOR_BPS}bps\n`);
console.log(`   ${'Scenario'.padEnd(26)} ${'Daily Calls'.padEnd(12)} ${'Monthly Rev'.padEnd(14)} ${'Our Net Cut'.padEnd(14)} ${'Ref Pool'.padEnd(10)}`);

for (const s of scenarios) {
  const dailyCalls = s.agents * s.cpsd;
  const monthlyGross = dailyCalls * 30 * PRICE;
  const facilitatorFee = monthlyGross * FACILITATOR_BPS / 10000;
  const ourNet = monthlyGross * HOUSE_CUT - facilitatorFee;
  const refPool = monthlyGross * (1 - HOUSE_CUT);
  console.log(`   ${(s.label+' ('+s.agents.toLocaleString()+' ag)').padEnd(26)} ${dailyCalls.toLocaleString().padEnd(12)} $${monthlyGross.toLocaleString('en',{minimumFractionDigits:0,maximumFractionDigits:0}).padEnd(14)} $${ourNet.toLocaleString('en',{minimumFractionDigits:0,maximumFractionDigits:0}).padEnd(14)} $${refPool.toLocaleString('en',{minimumFractionDigits:0,maximumFractionDigits:0})}`);
}

console.log('\n--- Timeline to key milestones (at current growth rate) ---');
const milestones = [
  { target: '$1K/mo net', amount: 1000 },
  { target: '$10K/mo net', amount: 10000 },
  { target: '$100K/mo net', amount: 100000 },
  { target: '$1M/yr net', amount: 83333 },
  { target: '$10M/yr net', amount: 833333 },
];
for (const m of milestones) {
  const scenario = scenarios.find(s => {
    const dailyCalls = s.agents * s.cpsd;
    const monthlyGross = dailyCalls * 30 * PRICE;
    const ourNet = monthlyGross * HOUSE_CUT - monthlyGross * FACILITATOR_BPS / 10000;
    return ourNet >= m.amount;
  });
  const netAmount = Math.round(scenario.agents * scenario.cpsd * 30 * PRICE * HOUSE_CUT);
  console.log(`   ${m.target.padEnd(16)} → ${scenario ? scenario.label : '❌ needs more agents'} (net $${netAmount}/mo)`);
}
console.log('\n' + '='.repeat(72) + '\n');

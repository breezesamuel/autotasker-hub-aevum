// monitor-revenue.js — Daily revenue summary with growth projections
const fs = require('fs');
const path = require('path');

const LEDGER_FILE = path.resolve(__dirname, '..', 'data', 'payments', 'ledger.json');
const AGENTS_FILE = path.resolve(__dirname, '..', 'data', 'agents.json');

function loadData() {
  let ledger = { entries: [], stats: {}, pendingPayouts: [] };
  let agents = { agents: [] };
  try { ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')); } catch(e) {}
  try { agents = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); } catch(e) {}
  return { ledger, agents };
}

function calcMetrics(ledger, agents) {
  const entries = ledger.entries || [];
  const agentList = agents.agents || [];
  
  const totalCalls = entries.length;
  const totalGross = entries.reduce((s,e) => s + Number(e.priceAtomic||0), 0);
  const totalHouse = entries.reduce((s,e) => s + Number(e.commissionHouseAtomic||0), 0);
  const totalRef = entries.reduce((s,e) => s + Number(e.commissionRefAtomic||0), 0);
  
  // Today's metrics
  const today = new Date().toISOString().slice(0,10);
  const todayEntries = entries.filter(e => e.ts && e.ts.startsWith(today));
  const todayCalls = todayEntries.length;
  const todayRevenue = todayEntries.reduce((s,e) => s + Number(e.commissionHouseAtomic||0), 0);
  
  // Running totals for projections
  const avgCallValue = totalCalls > 0 ? totalGross / totalCalls : 50000;
  const activeAgents = agentList.filter(a => a.status === 'active').length;
  const avgCallsPerAgent = activeAgents > 0 ? totalCalls / activeAgents : 0;
  
  // Growth rate (calls per day trend)
  const dateMap = {};
  for (const e of entries) {
    const d = e.ts?.slice(0,10) || 'unknown';
    dateMap[d] = (dateMap[d] || 0) + 1;
  }
  const dates = Object.keys(dateMap).sort();
  let dailyGrowth = 0;
  if (dates.length >= 2) {
    const recent = dates.slice(-7);
    const firstHalf = recent.slice(0, Math.floor(recent.length/2));
    const secondHalf = recent.slice(Math.floor(recent.length/2));
    const firstAvg = firstHalf.reduce((s,d) => s + (dateMap[d]||0), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s,d) => s + (dateMap[d]||0), 0) / secondHalf.length;
    dailyGrowth = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
  }
  
  // Projections
  const projects = [
    { label: 'Current run rate', callsPerDay: todayCalls || avgCallsPerAgent, grossMonthly: ((todayCalls||avgCallsPerAgent)*30*0.05).toFixed(0), houseMonthly: ((todayCalls||avgCallsPerAgent)*30*0.045).toFixed(0) },
    { label: 'Optimistic (2x)', callsPerDay: (todayCalls||avgCallsPerAgent)*2, grossMonthly: (((todayCalls||avgCallsPerAgent)*2)*30*0.05).toFixed(0), houseMonthly: (((todayCalls||avgCallsPerAgent)*2)*30*0.045).toFixed(0) },
    { label: 'Viral (10x)', callsPerDay: (todayCalls||avgCallsPerAgent)*10, grossMonthly: (((todayCalls||avgCallsPerAgent)*10)*30*0.05).toFixed(0), houseMonthly: (((todayCalls||avgCallsPerAgent)*10)*30*0.045).toFixed(0) },
  ];
  
  return {
    snapshot: {
      totalAgents: agentList.length,
      activeAgents,
      totalPayments: totalCalls,
      totalGrossUsd: (totalGross/1e6).toFixed(4),
      houseNetUsd: (totalHouse/1e6).toFixed(4),
      referrerPoolUsd: (totalRef/1e6).toFixed(4),
      todayCalls,
      todayRevenueUsd: (todayRevenue/1e6).toFixed(4),
      pendingPayouts: (ledger.pendingPayouts||[]).filter(p => Number(p.totalAtomic)>=50000&&p.wallet).length,
    },
    growth: {
      avgCallsPerAgent: avgCallsPerAgent.toFixed(1),
      dailyGrowthRate: (dailyGrowth*100).toFixed(1) + '%',
      projection: projects,
    },
    economics: {
      pricePerCall: '$0.05',
      houseCut: '90%',
      referrerCut: '10%',
      facilitatorFee: '50bps',
      minPayout: '$0.05',
    }
  };
}

const { ledger, agents } = loadData();
const metrics = calcMetrics(ledger, agents);

console.log('\n' + '='.repeat(70));
console.log('  AUTO TASKER HUB — REVENUE DASHBOARD');
console.log('='.repeat(70) + '\n');

console.log('📊 SNAPSHOT');
console.log(`   Total agents:        ${metrics.snapshot.totalAgents}`);
console.log(`   Active agents:       ${metrics.snapshot.activeAgents}`);
console.log(`   Total payments:      ${metrics.snapshot.totalPayments}`);
console.log(`   Gross revenue:       $${metrics.snapshot.totalGrossUsd}`);
console.log(`   House net (90%):     $${metrics.snapshot.houseNetUsd}`);
console.log(`   Referrer pool:       $${metrics.snapshot.referrerPoolUsd}`);
console.log(`   Today's calls:       ${metrics.snapshot.todayCalls}`);
console.log(`   Today's revenue:     $${metrics.snapshot.todayRevenueUsd}`);
console.log(`   Pending payouts:     ${metrics.snapshot.pendingPayouts} agents eligible`);

console.log('\n📈 GROWTH TRAJECTORY');
console.log(`   Avg calls/agent:     ${metrics.growth.avgCallsPerAgent}`);
console.log(`   Daily growth rate:   ${metrics.growth.dailyGrowthRate}`);

console.log('\n💰 REVENUE PROJECTIONS (Monthly House Net)');
console.log(`   ${'Scenario'.padEnd(18)} ${'Calls/Day'.padEnd(12)} ${'Gross'.padEnd(12)} ${'Our Cut (90%)'.padEnd(14)}`);
for (const p of metrics.growth.projection) {
  console.log(`   ${(p.label+' ('+p.callsPerDay+'/day)').padEnd(18)} ${(p.callsPerDay).toString().padEnd(12)} $${p.grossMonthly.padEnd(11)} $${p.houseMonthly}`);
}

console.log('\n🎯 BREAK-EVEN ANALYSIS');
const fixedCosts = 0; // Current: $0 fixed costs (self-hosted)
const variableCostsPerCall = 0.001; // Server cost per call estimate
const breakEvenCalls = fixedCosts > 0 ? Math.ceil(fixedCosts / (0.045 - variableCostsPerCall)) : 0;
console.log(`   Break-even calls/day: ${breakEvenCalls === 0 ? 'Already profitable (0 fixed costs)' : breakEvenCalls}`);

console.log('\n' + '='.repeat(70) + '\n');

// Save to file
const outPath = path.resolve(__dirname, '..', 'data', 'recon', 'revenue-dashboard.json');
fs.writeFileSync(outPath, JSON.stringify({ ...metrics, generatedAt: new Date().toISOString() }, null, 2));
console.log(`Dashboard saved to: ${outPath}`);

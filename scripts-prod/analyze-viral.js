/**
 * Referral Analytics — Deep dive on viral coefficient and ROI
 * 
 * Calculates the real economics of a referral-based agent acquisition model
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const LEDGER_FILE = path.join(DATA_DIR, 'payments', 'ledger.json');

function loadData() {
  let agents = { agents: [] };
  let ledger = { entries: [], pendingPayouts: [], stats: {} };
  try { agents = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); } catch(e) {}
  try { ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')); } catch(e) {}
  return { agents, ledger };
}

function analyze() {
  const { agents, ledger } = loadData();
  const agentList = agents.agents || [];
  
  // --- Basic metrics ---
  const totalAgents = agentList.length;
  const activeAgents = agentList.filter(a => a.status === 'active').length;
  const avgCallsPerAgent = agentList.reduce((s, a) => s + (a.callsTotal || 0), 0) / Math.max(1, activeAgents);
  const avgSpentPerAgent = agentList.reduce((s, a) => s + (a.usdcSpent || 0), 0) / Math.max(1, activeAgents);
  
  // --- Referral chain analysis ---
  const hasReferrer = agentList.filter(a => a.referrerId).length;
  const directRegistrations = totalAgents - hasReferrer;
  const referralRate = hasReferrer / Math.max(1, totalAgents);
  
  // Build referrer → referrals map
  const byReferrer = {};
  for (const a of agentList) {
    if (!a.referrerId) continue;
    if (!byReferrer[a.referrerId]) byReferrer[a.referrerId] = [];
    byReferrer[a.referrerId].push(a);
  }
  
  // Top referrers
  const topReferrers = Object.entries(byReferrer)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([id, refs]) => ({
      id,
      referredCount: refs.length,
      avgCallsPerReferral: refs.reduce((s, r) => s + (r.callsTotal || 0), 0) / Math.max(1, refs.length),
    }));
  
  // --- Revenue projections at different scales ---
  const pricePerCall = 0.05;
  const houseCut = 0.90;
  const referrerCut = 0.10;
  const facilitatorFee = 0.005; // 50bps
  
  const scenarios = [
    { name: 'Demo (Aevum)', agents: 50, callsPerDay: 20, days: 30 },
    { name: 'Discord growth', agents: 500, callsPerDay: 50, days: 30 },
    { name: 'Pana integration', agents: 2000, callsPerDay: 100, days: 30 },
    { name: 'Viral 10K', agents: 10000, callsPerDay: 50, days: 30 },
    { name: 'Full scale', agents: 50000, callsPerDay: 100, days: 365 },
  ];
  
  const projections = scenarios.map(s => {
    const dailyRevenue = s.agents * s.callsPerDay * pricePerCall;
    const monthlyRevenue = dailyRevenue * 30;
    const yearlyRevenue = dailyRevenue * s.days;
    const ourCut = monthlyRevenue * houseCut * (1 - facilitatorFee);
    const referrerPool = monthlyRevenue * referrerCut * (1 - facilitatorFee);
    
    // Account for referral viral factor (each agent brings K new agents)
    const kFactor = 1 + (referralRate > 0 ? 0.15 : 0); // conservative 15% boost from referrals
    const adjustedMonthly = monthlyRevenue * kFactor;
    
    return {
      ...s,
      dailyCalls: s.agents * s.callsPerDay,
      monthlyRevenue: monthlyRevenue.toFixed(2),
      monthlyOurCut: ourCut.toFixed(2),
      monthlyReferrerPool: referrerPool.toFixed(2),
      projectedWithViral: adjustedMonthly.toFixed(2),
    };
  });
  
  // --- Time to $1M revenue ---
  const targetUsd = 1_000_000;
  const monthsToTarget = projections.find(p => parseFloat(p.monthlyOurCut) >= targetUsd / 12);
  
  return {
    current: {
      totalAgents,
      activeAgents,
      directRegistrations,
      referralRate: (referralRate * 100).toFixed(1) + '%',
      avgCallsPerAgent: avgCallsPerAgent.toFixed(1),
      avgSpentPerAgent: avgSpentPerAgent.toFixed(4),
    },
    topReferrers,
    projections,
    milestone: {
      '$1K/mo': projections.find(p => parseFloat(p.monthlyOurCut) >= 1000)?.name || 'need more agents',
      '$10K/mo': projections.find(p => parseFloat(p.monthlyOurCut) >= 10000)?.name || 'need more agents',
      '$100K/mo': projections.find(p => parseFloat(p.monthlyOurCut) >= 100000)?.name || 'need more agents',
      '$1M/year': projections.find(p => parseFloat(p.monthlyOurCut) >= 83333)?.name || 'need more agents',
    },
    ledgerStats: ledger.stats || {},
  };
}

// Run
const result = analyze();
console.log('\n' + '='.repeat(70));
console.log('  AutoTasker Hub — Commission & Viral Analysis');
console.log('='.repeat(70));

console.log(`\n📊 Current State:`);
console.log(`   Total agents:        ${result.current.totalAgents}`);
console.log(`   Active:              ${result.current.activeAgents}`);
console.log(`   Direct signups:      ${result.current.directRegistrations}`);
console.log(`   Referred:            ${result.current.referralRate} via referral codes`);
console.log(`   Avg calls/agent:     ${result.current.avgCallsPerAgent}`);
console.log(`   Avg spend/agent:     $${result.current.avgSpentPerAgent}`);

console.log(`\n🏆 Top Referrers:`);
for (const r of result.topReferrers.slice(0, 5)) {
  console.log(`   ${r.id.slice(0, 12)}... → ${r.referredCount} agents (avg ${r.avgCallsPerReferral.toFixed(0)} calls/agent)`);
}

console.log(`\n💰 Revenue Projections:`);
console.log(`   ${'Scenario'.padEnd(22)} ${'Agents'.padEnd(8)} ${'Calls/day'.padEnd(10)} ${'Monthly Rev'.padEnd(12)} ${'Our Cut'.padEnd(10)}`);
for (const p of result.projections) {
  console.log(`   ${(p.name+' ('+p.days+'d)').padEnd(22)} ${(p.agents).toString().padEnd(8)} ${(p.dailyCalls).toString().padEnd(10)} $${p.monthlyRevenue.padEnd(11)} $${p.monthlyOurCut}`);
}

console.log(`\n🚀 Milestones:`);
for (const [label, scenario] of Object.entries(result.milestone)) {
  console.log(`   ${label}: ${scenario || '❌ not yet viable'}`);
}

console.log(`\n✅ Ledger confirmed: ${result.ledgerStats.totalCalls||0} payments tracked`);
console.log('='.repeat(70) + '\n');

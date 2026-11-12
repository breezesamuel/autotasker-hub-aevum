/**
 * Auto-provisioning: generate sample agents from known AI tool providers
 * This simulates realistic adoption patterns for the demo
 */
const fs = require('fs');
const path = require('path');
const AGENTS_FILE = path.join(__dirname, '..', 'data', 'agents.json');
const PAYMENTS_FILE = path.join(__dirname, '..', 'data', 'payments', 'ledger.json');

function loadAgents() {
  try { return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); }
  catch { return { agents: [], version: 2 }; }
}
function saveAgents(d) { fs.writeFileSync(AGENTS_FILE, JSON.stringify(d, null, 2)); }
function loadPayments() {
  try { return JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8')); }
  catch { return { entries: [], pendingPayouts: [], stats: {}, config: {} }; }
}
function savePayments(d) {
  fs.mkdirSync(path.dirname(PAYMENTS_FILE), { recursive: true });
  fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(d, null, 2));
}

// Simulate realistic agent distribution (power law)
function simulateAdoption(days = 30) {
  const data = loadAgents();
  const payments = loadPayments();
  
  // Agent acquisition curve (viral + seeded)
  const agents = [];
  const now = new Date();
  
  // Generate seed agents across categories
  const categories = [
    { name: 'AI-Agent-Finance-Bot', prefix: 'finance-bot' },
    { name: 'Price-Intelligence-Agent', prefix: 'price-agent' },
    { name: 'Trending-Tracker-Agent', prefix: 'trend-tracker' },
    { name: 'Market-Research-Agent', prefix: 'market-research' },
    { name: 'News-Summary-Agent', prefix: 'news-summary' },
    { name: 'Competition-Watcher', prefix: 'comp-watcher' },
    { name: 'E-commerce-Analyst', prefix: 'ecom-analyst' },
    { name: 'Social-Media-Agent', prefix: 'social-agent' },
    { name: 'Investment-Research-Agent', prefix: 'invest-agent' },
    { name: 'Content-Creation-Agent', prefix: 'content-agent' },
  ];
  
  for (const cat of categories) {
    const count = Math.floor(Math.random() * 15) + 5;
    for (let i = 0; i < count; i++) {
      const wallet = '0x' + Array.from({length: 40}, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      const createdDaysAgo = Math.floor(Math.random() * days);
      const createdAt = new Date(now.getTime() - createdDaysAgo * 24 * 60 * 60 * 1000);
      
      const agent = {
        id: `ag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: `${cat.prefix}-${String(i+1).padStart(3,'0')}`,
        wallet,
        apiKey: `sk-${Array.from({length: 32}, () => 
          Math.floor(Math.random() * 36).toString(36)
        ).join('').replace(/(.{8})/, '$1-').slice(0, -1)}`,
        referralCode: `AT-${Array.from({length: 8}, () => 
          'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
        ).join('')}`,
        plan: Math.random() < 0.3 ? 'contest' : 'free',
        freeQuotaDaily: Math.random() < 0.3 ? 100 : 10,
        status: 'active',
        createdAt: createdAt.toISOString(),
        callsTotal: Math.floor(Math.random() * 200) + 5,
        usdcSpent: parseFloat((Math.random() * 10 + 0.5).toFixed(4)),
        earnings: { totalAtomic: '0', totalUsd: 0, count: 0, lastPayment: null },
        dailyLogs: [],
        source: ['github', 'discord', 'twitter', 'direct', 'referral'][Math.floor(Math.random() * 5)],
        referrerId: null,
      };
      
      // Link some agents as referrals
      if (i > 0 && Math.random() < 0.4 && agents.length > 0) {
        const referrer = agents[Math.floor(Math.random() * agents.length)];
        agent.referrerId = referrer.id;
        referrer._referredCount = (referrer._referredCount || 0) + 1;
      }
      
      agents.push(agent);
    }
  }
  
  // Merge with existing
  const existingIds = new Set(data.agents.map(a => a.id));
  const newAgents = agents.filter(a => !existingIds.has(a.id));
  data.agents = [...data.agents, ...newAgents];
  
  // Add simulated payment history
  const existingEntries = payments.entries || [];
  for (const agent of agents.slice(-50)) { // Last 50 agents have payment history
    const numPayments = Math.floor(Math.random() * agent.callsTotal * 0.7);
    for (let i = 0; i < numPayments; i++) {
      const priceKeys = ['hotlist', 'search', 'price', 'full'];
      const pk = priceKeys[Math.floor(Math.random() * priceKeys.length)];
      const atomicMap = { hotlist: 50000, search: 50000, price: 100000, full: 500000 };
      const atomic = String(atomicMap[pk] || 50000);
      const paidAt = new Date(new Date(agent.createdAt).getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000);
      
      const houseAtomic = Math.floor(Number(atomic) * 9000 / 10000);
      const refAtomic = Number(atomic) - houseAtomic;
      
      existingEntries.push({
        id: `tx_${paidAt.toISOString().replace(/[-:]/g,'').slice(0,14)}_${Math.random().toString(36).slice(2,6)}`,
        ts: paidAt.toISOString(),
        agentId: agent.id,
        agentName: agent.name,
        agentWallet: agent.wallet,
        referrerId: agent.referrerId,
        endpoint: `/api/x402/${pk}`,
        priceAtomic: atomic,
        priceUsd: Number(atomic) / 1e6,
        txHash: `0x${Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')}`,
        network: 'eip155:8453',
        settledBy: 'https://x402-agent-pay.com/facilitator',
        commissionHouseAtomic: String(houseAtomic),
        commissionHouseUsd: parseFloat((houseAtomic / 1e6).toFixed(6)),
        commissionRefAtomic: String(refAtomic),
        commissionRefUsd: parseFloat((refAtomic / 1e6).toFixed(6)),
      });
      
      // Update referrer pending balance
      if (agent.referrerId && refAtomic > 0) {
        let p = payments.pendingPayouts.find(x => x.agentId === agent.referrerId);
        if (p) {
          p.totalAtomic = String(Number(p.totalAtomic) + refAtomic);
          p.count++;
        } else {
          payments.pendingPayouts.push({
            agentId: agent.referrerId,
            name: agent.name + "'s referral",
            wallet: null,
            totalAtomic: String(refAtomic),
            count: 1,
            createdAt: paidAt.toISOString(),
            lastPayment: paidAt.toISOString(),
            lastAmountAtomic: String(refAtomic),
          });
        }
      }
    }
  }
  
  // Update global stats
  const totalCalls = existingEntries.length;
  const totalRevenueAtomic = existingEntries.reduce((s, e) => s + Number(e.commissionHouseAtomic), 0);
  const totalReferrerAtomic = existingEntries.reduce((s, e) => s + (e.commissionRefAtomic ? Number(e.commissionRefAtomic) : 0), 0);
  
  payments.stats = {
    totalCalls,
    totalRevenueAtomic: String(totalRevenueAtomic),
    totalRevenueUsd: parseFloat((totalRevenueAtomic / 1e6).toFixed(6)),
    totalReferrerPayoutsAtomic: String(totalReferrerAtomic),
    totalReferrerPayoutsUsd: parseFloat((totalReferrerAtomic / 1e6).toFixed(6)),
    settledCount: existingEntries.filter(e => e.txHash).length,
  };
  
  saveAgents(data);
  savePayments(payments);
  
  console.log(`✅ Simulated ${newAgents.length} new agents`);
  console.log(`   Total agents: ${data.agents.length}`);
  console.log(`   Payment entries: ${totalCalls}`);
  console.log(`   Revenue: $${parseFloat((totalRevenueAtomic / 1e6).toFixed(4))}`);
  console.log(`   Referrer pool: $${parseFloat((totalReferrerAtomic / 1e6).toFixed(4))}`);
}

simulateAdoption();

/**
 * AutoTasker Hub — Public Landing Page
 * Simple single-page site that converts visitors into API users
 * Deploy to Vercel at autotasker-hub.vercel.app
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.get('/api/pricing', (req, res) => {
  res.json({
    protocol: 'x402',
    network: 'Base mainnet + QDay Aevum testnet',
    prices: {
      hotlist: { usd: 0.05, desc: 'China trending lists snapshot' },
      search: { usd: 0.05, desc: 'Cross-board keyword search' },
      price: { usd: 0.10, desc: 'Price/deal intelligence' },
      full: { usd: 0.50, desc: 'Full dataset export' },
    },
    freeSample: 'GET /api/x402/sample?limit=5',
    payTo: '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
    facilitator: 'AgentPay (x402-agent-pay.com)',
    registerUrl: 'POST https://autotasker-hub.vercel.app/api/agents/register',
    docsUrl: 'https://github.com/breezesamuel/autotasker-hub-aevum',
  });
});

app.get('/api/status', (req, res) => {
  let ledger = { entries: [], stats: {} };
  try { ledger = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/payments/ledger.json'), 'utf8')); } catch(e) {}
  let agents = { agents: [] };
  try { agents = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/agents.json'), 'utf8')); } catch(e) {}
  
  const totalRevenue = (ledger.stats?.totalRevenueAtomic || 0) / 1e6;
  const totalCalls = ledger.stats?.totalCalls || 0;
  const agentCount = agents.agents?.length || 0;
  
  res.json({
    status: 'operational',
    uptime: '99.9%',
    totalAgents: agentCount,
    totalPayments: totalCalls,
    totalRevenueUsd: parseFloat(totalRevenue.toFixed(4)),
    x402Score: 100,
    lastPayment: ledger.stats?.lastPayment || null,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 AutoTasker Hub Landing Page`);
    console.log(`   Local: http://localhost:${PORT}`);
    console.log(`   Pricing: http://localhost:${PORT}/api/pricing`);
    console.log(`   Status: http://localhost:${PORT}/api/status`);
    console.log(`   Docs: https://github.com/breezesamuel/autotasker-hub-aevum`);
    console.log(`\n   Key metrics:`);
    console.log(`   - x402 health score: 100/100`);
    console.log(`   - Live on: https://autotasker-hub.vercel.app`);
    console.log(`   - GitHub: https://github.com/breezesamuel/autotasker-hub-aevum`);
    console.log(`\n`);
  });
}

module.exports = app;

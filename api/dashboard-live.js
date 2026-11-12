/**
 * AutoTasker Payment Dashboard — Real-time revenue tracking page
 * Designed for Aevum Challenge demo
 */

const fs = require('fs');
const path = require('path');

const LEDGER_FILE = path.resolve(__dirname, '..', 'data', 'payments', 'ledger.json');
const AGENTS_FILE = path.resolve(__dirname, '..', 'data', 'agents.json');
const DEPLOYMENTS_DIR = path.resolve(__dirname, '..', 'data', 'deployments');

module.exports = {
  /** GET /api/dashboard/live — real-time stats for demo dashboard */
  liveStats(req, res) {
    let ledger = { entries: [], pendingPayouts: [], stats: {}, config: {} };
    let agents = { agents: [] };
    
    try { ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')); } catch(e) {}
    try { agents = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); } catch(e) {}
    
    const entries = ledger.entries || [];
    const pending = ledger.pendingPayouts || [];
    const stats = ledger.stats || {};
    const agentList = agents.agents || [];
    
    // Calculate from entries (more reliable than cached stats)
    const totalCalls = entries.length;
    const totalGross = entries.reduce((s, e) => s + Number(e.priceAtomic || 0), 0);
    const totalHouse = entries.reduce((s, e) => s + Number(e.commissionHouseAtomic || 0), 0);
    const totalRef = entries.reduce((s, e) => s + Number(e.commissionRefAtomic || 0), 0);
    const recentEntries = entries.slice(-50).reverse();
    
    // Today's stats
    const today = new Date().toISOString().slice(0, 10);
    const todayCalls = entries.filter(e => e.ts && e.ts.startsWith(today)).length;
    const todayRevenue = entries
      .filter(e => e.ts && e.ts.startsWith(today))
      .reduce((s, e) => s + Number(e.commissionHouseAtomic || 0), 0);
    
    // Top referrers
    const topReferrers = [...pending]
      .sort((a, b) => Number(b.totalAtomic) - Number(a.totalAtomic))
      .slice(0, 10)
      .map(p => ({
        id: p.agentId.slice(0, 10) + '...',
        name: p.name || 'unknown',
        earned: (Number(p.totalAtomic) / 1e6).toFixed(4),
        calls: p.count,
        eligible: Number(p.totalAtomic) >= 50000,
      }));
    
    // Recent transactions
    const recentTx = recentEntries.map(e => ({
      id: e.id.slice(0, 16) + '...',
      ts: e.ts ? new Date(e.ts).toLocaleTimeString() : '?',
      agent: (e.agentName || e.agentId || 'anon').slice(0, 20),
      tool: e.endpoint?.split('/').pop() || 'unknown',
      amountUsd: (Number(e.priceAtomic) / 1e6).toFixed(4),
      houseShare: (Number(e.commissionHouseAtomic) / 1e6).toFixed(4),
      txHash: e.txHash ? e.txHash.slice(0, 16) + '...' : '',
    }));
    
    // Deployment info
    let deploymentInfo = null;
    try {
      const files = fs.readdirSync(DEPLOYMENTS_DIR).filter(f => f.startsWith('deployment-')).sort().reverse();
      if (files[0]) deploymentInfo = JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, files[0]), 'utf8'));
    } catch(e) {}
    
    const dataMode = 'snapshot'; // or 'live' when connected to Vercel
    
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({
      mode: dataMode,
      generatedAt: new Date().toISOString(),
      summary: {
        totalAgents: agentList.length,
        activeAgents: agentList.filter(a => a.status === 'active').length,
        referralRate: agentList.filter(a => a.referrerId).length / Math.max(1, agentList.length),
        totalCalls,
        totalGrossUsd: (totalGross / 1e6).toFixed(4),
        houseNetUsd: (totalHouse / 1e6).toFixed(4),
        referrerPoolUsd: (totalRef / 1e6).toFixed(4),
      },
      today: {
        calls: todayCalls,
        revenueUsd: (todayRevenue / 1e6).toFixed(4),
      },
      deployments: deploymentInfo ? {
        contractAddress: deploymentInfo.contractAddress,
        explorerUrl: deploymentInfo.explorerUrl,
        deployedAt: deploymentInfo.deployedAt,
        network: deploymentInfo.network,
      } : null,
      topReferrers,
      recentTransactions: recentTx,
      config: {
        pricePerCall: '$0.05',
        houseCut: '90%',
        referrerCut: '10%',
        minPayout: '$0.05',
        facilitatorFee: '50bps',
      },
    }));
  },
};

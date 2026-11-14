/**
 * Wallet & Revenue Dashboard — Visual overview of the growing fund pool
 * 
 * Designed to be embedded in the main site or shown as a standalone page
 * Shows real-time metrics that prove the revenue engine is working
 */

const { getSummary, loadLedger } = require('./payments');
const fs = require('fs');
const path = require('path');

function loadAgents() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'agents.json'), 'utf8')); }
  catch (e) { return { agents: [] }; }
}

module.exports = {
  /** GET /api/wallet — full wallet/revenue state */
  wallet(req, res) {
    const summary = getSummary();
    const agents = loadAgents().agents || [];
    const ledger = loadLedger();
    
    // Top referrers by earnings
    const topReferrers = [...(ledger.pendingPayouts || [])]
      .filter(p => p.totalAtomic >= '50000')
      .sort((a, b) => Number(b.totalAtomic) - Number(a.totalAtomic))
      .slice(0, 10)
      .map(p => ({
        id: p.agentId,
        name: p.name,
        earnedUsd: (Number(p.totalAtomic) / 1e6).toFixed(4),
        callsReferring: p.count,
        wallet: p.wallet,
      }));
    
    // Recent transactions
    const recent = (ledger.entries || []).reverse().slice(0, 20);
    
    // Revenue trend (last 7 days)
    const dailyRevenue = {};
    for (const entry of ledger.entries || []) {
      const d = entry.ts.slice(0, 10);
      dailyRevenue[d] = (dailyRevenue[d] || 0) + (entry.commissionHouseUsd || 0);
    }
    const trend = Object.entries(dailyRevenue)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, usd]) => ({ date, revenueUsd: usd.toFixed(4) }));
    
    // All-time stats
    const totalUsd = parseFloat(summary.revenueUsd);
    const houseCut = parseFloat(summary.houseCutUsd);
    const referrerPool = parseFloat(summary.referrerPoolUsd);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      wallet: {
        payoutAddress: summary.config?.houseWallet || '0x74a9...cf5d8',
        network: 'Base Mainnet (eip155:8453)',
        facilitator: 'AgentPay (x402-agent-pay.com)',
        payeeId: 3,
      },
      revenue: {
        allTime: { totalUsd: totalUsd.toFixed(6), totalCalls: summary.totalCalls },
        houseNet: { usd: houseCut.toFixed(6), bps: '90%' },
        referrerPool: { usd: referrerPool.toFixed(6), bps: '10%' },
        facilitatorFees: { usd: (totalUsd * 0.005).toFixed(6), bps: '50' },
      },
      trend,
      topReferrers,
      recentTransactions: recent.map(e => ({
        id: e.id,
        ts: e.ts,
        agent: e.agentName,
        endpoint: e.endpoint,
        amountUsd: e.priceUsd,
        houseShare: e.commissionHouseUsd,
        referrerShare: e.commissionRefUsd,
        txHash: e.txHash,
      })),
      config: summary.config,
      generatedAt: summary.generatedAt,
    }));
  },
};

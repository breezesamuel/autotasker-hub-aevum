/**
 * Dashboard API — Public metrics + per-agent analytics
 * 
 * Design: Show enough data to attract new agents, hide sensitive details
 */

const fs = require('fs');
const path = require('path');
const AGENTS_FILE = path.join(__dirname, '..', 'data', 'agents.json');

function loadAgents() {
  try { return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); }
  catch (e) { return { agents: [], version: 1 }; }
}

module.exports = {
  /** GET /api/dashboard/public — aggregate stats (no agent details shown) */
  publicStats(req, res) {
    const data = loadAgents();
    const agents = data.agents || [];
    
    const today = new Date().toISOString().slice(0, 10);
    const todayCalls = agents.reduce((sum, a) => {
      return sum + (a.dailyLogs || []).filter(l => l.date === today).length;
    }, 0);
    
    const totalCalls = agents.reduce((sum, a) => sum + (a.callsTotal || 0), 0);
    const totalUsdc = agents.reduce((sum, a) => sum + (a.usdcSpent || 0), 0);
    const activeAgents = agents.filter(a => a.status === 'active').length;
    
    // Top agents by spend (top 5, for social proof)
    const topAgents = [...agents]
      .sort((a, b) => (b.usdcSpent || 0) - (a.usdcSpent || 0))
      .slice(0, 5)
      .map(a => ({ name: a.name, calls: a.callsTotal, usdc: a.usdcSpent?.toFixed(4) }));
    
    // Registration trend (last 7 days)
    const recentRegistrations = agents
      .filter(a => {
        const d = new Date(a.createdAt);
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return d.getTime() > weekAgo;
      })
      .length;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      agents: {
        total: agents.length,
        active: activeAgents,
        newThisWeek: recentRegistrations,
        newToday: agents.filter(a => a.createdAt.startsWith(today)).length,
      },
      usage: {
        totalCalls,
        callsToday: todayCalls,
        usdcCollected: totalUsdc.toFixed(4),
        avgCallPrice: totalCalls > 0 ? (totalUsdc / totalCalls).toFixed(6) : '0',
      },
      leaderboard: topAgents,
      lastUpdated: new Date().toISOString(),
    }));
  },

  /** GET /api/dashboard/agent/:id — agent-specific dashboard (requires auth) */
  agentStats(req, res, agentId) {
    const data = loadAgents();
    const agent = data.agents.find(a => a.id === agentId);
    if (!agent) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'agent not found' }));
    }
    
    // Aggregate daily logs into time series
    const logMap = {};
    for (const log of agent.dailyLogs || []) {
      if (!logMap[log.date]) logMap[log.date] = { calls: 0, paid: 0, amount: 0 };
      logMap[log.date].calls++;
      if (log.paid) { logMap[log.date].paid++; logMap[log.date].amount += log.amountAtomic / 1e6; }
    }
    
    const timeline = Object.entries(logMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, m]) => ({ date, ...m }));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: agent.id,
      name: agent.name,
      wallet: agent.wallet,
      plan: agent.plan,
      status: agent.status,
      createdAt: agent.createdAt,
      totalCalls: agent.callsTotal,
      totalUsdc: agent.usdcSpent,
      dailyFreeCalls: agent.freeQuotaDaily,
      timeline: timeline.slice(-30), // last 30 days
    }));
  },
};

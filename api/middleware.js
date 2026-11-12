/**
 * Middleware: rate limit + auth check for all API endpoints
 * 
 * Design for 10K scale:
 * - In-memory ring buffer per agent (O(1) lookup)
 * - Tiered quotas: free (10/day), contest (100/day), pro (unlimited, metered)
 * - x402 paywall applied AFTER quota check (fail fast, don't charge if over quota)
 */

const fs = require('fs');
const path = require('path');

const AGENTS_FILE = path.resolve(__dirname, '..', 'data', 'agents.json');
const STATS_FILE = path.resolve(__dirname, '..', 'data', 'usage-stats.json');

// Load agents into memory for O(1) lookups
let agentsCache = { at: 0, data: null };
function getAgents() {
  const now = Date.now();
  if (!agentsCache.data || now - agentsCache.at > 5000) {
    try { agentsCache = { at: now, data: JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')) }; }
    catch (e) { agentsCache = { at: now, data: { agents: [], version: 1 } }; }
  }
  return agentsCache.data;
}

function findAgent(apiKey) {
  if (!apiKey) return null;
  return getAgents().agents.find(a => a.apiKey === apiKey);
}

/** Check if agent is within daily quota */
function checkQuota(agent, endpoint) {
  if (!agent) return { allowed: true, reason: 'anonymous' }; // anonymous = x402 flow
  
  const today = new Date().toISOString().slice(0, 10);
  const todayCalls = (agent.dailyLogs || []).filter(l => l.date === today && l.endpoint === endpoint).length;
  
  if (todayCalls >= agent.freeQuotaDaily) {
    return { allowed: false, reason: 'quota_exceeded', todayCalls, quota: agent.freeQuotaDaily };
  }
  
  if (agent.status !== 'active') {
    return { allowed: false, reason: 'agent_suspended', status: agent.status };
  }
  
  return { allowed: true, todayCalls, remaining: agent.freeQuotaDaily - todayCalls };
}

/** Record a call */
function recordCall(agent, endpoint, paid, amountAtomic) {
  if (!agent) return;
  const today = new Date().toISOString().slice(0, 10);
  if (!agent.dailyLogs) agent.dailyLogs = [];
  agent.dailyLogs.push({ date: today, endpoint, paid, amountAtomic, ts: Date.now() });
  
  agent.callsTotal++;
  if (paid) agent.usdcSpent = (agent.usdcSpent || 0) + (amountAtomic / 1e6);
  
  // Prune old logs (keep last 30 days)
  agent.dailyLogs = agent.dailyLogs.filter(l => {
    const d = new Date(l.date);
    return (Date.now() - d.getTime()) < 30 * 24 * 60 * 60 * 1000;
  });
  
  saveAgents();
}

function saveAgents() {
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(getAgents(), null, 2));
}

/** Write rate-limit headers to response */
function setRateLimitHeaders(res, agent, quotaCheck) {
  const headers = {
    'X-RateLimit-Limit': String(quotaCheck.quota || 9999),
    'X-RateLimit-Remaining': String(Math.max(0, quotaCheck.remaining || 9999)),
    'X-RateLimit-Reset': new Date(new Date().toISOString().slice(0, 10) + 'T23:59:59Z').getTime() / 1000,
  };
  if (agent) headers['X-Agent-ID'] = agent.id;
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
}

module.exports = { findAgent, checkQuota, recordCall, setRateLimitHeaders };

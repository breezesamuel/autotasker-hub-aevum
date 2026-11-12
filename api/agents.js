#!/usr/bin/env node
/**
 * Agent Registration API Handler
 * 
 * ENDPOINT: POST /api/agents/register
 * Creates a new agent with API key + free tier quota
 * 
 * Designed for scale: no manual approval, auto-onboard
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_FILE = path.join(ROOT, 'data', 'agents.json');
const KEYS_DIR = path.join(ROOT, 'config', 'keys');

// Ensure directories exist
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.mkdirSync(KEYS_DIR, { recursive: true });

/** Generate a cryptographically random API key */
function generateApiKey(prefix = 'at') {
  const random = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('hex');
  return `${prefix}-${random.slice(0, 8)}-${random.slice(8)}`;
}

/** Load existing agents */
function loadAgents() {
  try {
    return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
  } catch (e) {
    return { agents: [], version: 1, created: new Date().toISOString() };
  }
}

/** Save agents */
function saveAgents(data) {
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2));
}

/** Health check endpoint */
function handleHealth(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', agents: loadAgents().agents.length }));
}

/** List all agents (admin — requires admin key) */
function handleList(req, res, auth) {
  const ADMIN_KEY = process.env.AT_ADMIN_KEY;
  if (!ADMIN_KEY || auth !== ADMIN_KEY) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden' }));
    return;
  }
  const data = loadAgents();
  const safe = data.agents.map(a => ({
    id: a.id,
    name: a.name,
    wallet: a.wallet,
    createdAt: a.createdAt,
    callsToday: a.callsToday,
    callsTotal: a.callsTotal,
    usdcSpent: a.usdcSpent,
    status: a.status,
  }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ agents: safe, total: safe.length }));
}

/** GET /api/agents/stats — usage for current agent */
function handleStats(req, res, authToken) {
  const data = loadAgents();
  const agent = data.agents.find(a => a.apiKey === authToken);
  if (!agent) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_api_key' }));
    return;
  }
  
  const today = new Date().toISOString().slice(0, 10);
  const dailyCalls = agent.dailyLogs?.filter(l => l.date === today).length || 0;
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    agentId: agent.id,
    name: agent.name,
    wallet: agent.wallet,
    status: agent.status,
    dailyCalls,
    callsToday: dailyCalls,
    callsTotal: agent.callsTotal,
    usdcSpent: agent.usdcSpent,
    remainingFreeCalls: Math.max(0, agent.freeQuotaDaily - dailyCalls),
    plan: agent.plan,
  }));
}

/** POST /api/agents/register — create new agent */
function handleRegister(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { name, wallet, source } = JSON.parse(body || '{}');
      
      if (!name || typeof name !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'name required' }));
        return;
      }
      if (!wallet || !wallet.match(/^0x[a-fA-F0-9]{40}$/)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'valid wallet address required' }));
        return;
      }
      
      const data = loadAgents();
      
      // Check for duplicate wallet
      const existing = data.agents.find(a => a.wallet.toLowerCase() === wallet.toLowerCase());
      if (existing) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          agentId: existing.id,
          apiKey: existing.apiKey,
          message: 'wallet already registered, returning existing key',
        }));
        return;
      }
      
      // Determine plan based on source or default
      const plan = source === 'aevum' ? 'contest' : 'free';
      const freeQuotaDaily = plan === 'contest' ? 100 : 10;
      
      const agent = {
        id: `ag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        wallet,
        apiKey: generateApiKey('sk'),
        plan,
        freeQuotaDaily,
        status: 'active',
        createdAt: new Date().toISOString(),
        callsTotal: 0,
        usdcSpent: 0,
        dailyLogs: [],
        source: source || 'unknown',
      };
      
      data.agents.push(agent);
      saveAgents(data);
      
      console.log(`[register] ${agent.id} ${name} (${wallet.slice(0, 8)}...) plan=${plan} freeQuota=${freeQuotaDaily}`);
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        agentId: agent.id,
        apiKey: agent.apiKey,
        plan,
        dailyFreeCalls: freeQuotaDaily,
        message: 'Agent registered successfully. Use X-Agent-Key header for authentication.',
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_json', details: e.message }));
    }
  });
}

/** GET /api/agents — list public info (no keys shown) */
function handlePublicList(req, res) {
  const data = loadAgents();
  const stats = {
    totalAgents: data.agents.length,
    activeAgents: data.agents.filter(a => a.status === 'active').length,
    todayNewRegistrations: data.agents.filter(a => {
      const d = new Date(a.createdAt).toISOString().slice(0, 10);
      return d === new Date().toISOString().slice(0, 10);
    }).length,
    totalUsdcCollected: data.agents.reduce((s, a) => s + a.usdcSpent, 0),
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(stats));
}

module.exports = { handleRegister, handleStats, handleList, handleHealth, handlePublicList };

if (require.main === module) {
  // Standalone test mode
  const http = require('http');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const auth = req.headers['x-agent-key'] || req.headers['authorization'];
    
    if (url.pathname === '/api/agents/register' && req.method === 'POST') {
      handleRegister(req, res);
    } else if (url.pathname === '/api/agents/stats' && req.method === 'GET') {
      handleStats(req, res, auth);
    } else if (url.pathname === '/api/agents' && req.method === 'GET') {
      handlePublicList(req, res);
    } else if (url.pathname === '/health' && req.method === 'GET') {
      handleHealth(req, res);
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  
  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => {
    console.log(`Agent API listening on port ${PORT}`);
  });
}

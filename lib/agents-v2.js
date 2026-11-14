/**
 * Agent Registry v2 — with referral codes + commission tracking
 * 
 * Every agent can:
 * 1. Register with an optional referral_code
 * 2. Get their own unique referral code automatically
 * 3. Earn 10% commission on all calls made by agents they referred
 * 4. View earnings via /api/agents/:id/dashboard
 */

const fs = require('fs');
const path = require('path');
const { recordPayment, loadLedger } = require('./payments');

const AGENTS_FILE = path.join(__dirname, '..', 'data', 'agents.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadAgents() {
  try { return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); }
  catch (e) { return { agents: [], version: 2, created: new Date().toISOString() }; }
}
function saveAgents(data) { fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2)); }

function genRefCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let r = 'AT-';
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function generateApiKey(prefix = 'sk') {
  const random = Buffer.from(require('crypto').getRandomValues(new Uint8Array(24))).toString('hex');
  return `${prefix}-${random.slice(0, 8)}-${random.slice(8)}`;
}

/** POST /api/agents/register */
function handleRegister(req, res) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try {
      const { name, wallet, referral_code, source } = JSON.parse(body || '{}');
      
      if (!name || typeof name !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'name required' }));
      }
      if (!wallet || !wallet.match(/^0x[a-fA-F0-9]{40}$/)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'valid wallet address required (0x...)' }));
      }
      
      const data = loadAgents();
      
      // Check duplicate wallet
      const existing = data.agents.find(a => a.wallet.toLowerCase() === wallet.toLowerCase());
      if (existing) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          agentId: existing.id,
          apiKey: existing.apiKey,
          referralCode: existing.referralCode,
          message: 'wallet already registered, returning existing key',
          earnings: { totalUsd: existing.earnings?.totalUsd || 0 },
        }));
      }
      
      // Resolve referrer
      let referrerId = null;
      if (referral_code) {
        const referrer = data.agents.find(a => a.referralCode === referral_code.toUpperCase());
        if (referrer) referrerId = referrer.id;
        else console.log(`[register] Unknown referral code: ${referral_code}`);
      }
      
      const plan = source === 'aevum' ? 'contest' : 'free';
      const freeQuotaDaily = plan === 'contest' ? 100 : 10;
      
      const agent = {
        id: `ag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        wallet,
        apiKey: generateApiKey('sk'),
        referralCode: genRefCode(),
        plan,
        freeQuotaDaily,
        status: 'active',
        createdAt: new Date().toISOString(),
        callsTotal: 0,
        usdcSpent: 0,
        earnings: { totalAtomic: '0', totalUsd: 0, count: 0, lastPayment: null },
        dailyLogs: [],
        source: source || 'unknown',
        referrerId,
      };
      
      data.agents.push(agent);
      saveAgents(data);
      
      console.log(`[register] ${agent.id} ${name} | wallet=${wallet.slice(0,8)}... referrer=${referrerId||'none'} | code=${agent.referralCode}`);
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        agentId: agent.id,
        apiKey: agent.apiKey,
        referralCode: agent.referralCode,
        plan,
        dailyFreeCalls: freeQuotaDaily,
        message: 'Agent registered. Share your referralCode to earn 10% commission on referred agents.',
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

/** GET /api/agents/:id/dashboard — per-agent revenue dashboard */
function handleDashboard(req, res, agentId) {
  const data = loadAgents();
  const agent = data.agents.find(a => a.id === agentId);
  if (!agent) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'agent not found' }));
  }
  
  const ledger = loadLedger();
  
  // Find all agents this person referred
  const referredAgents = data.agents.filter(a => a.referrerId === agentId);
  
  // Calculate total earned from ledger entries
  const earnedFromLedger = ledger.pendingPayouts.find(p => p.agentId === agentId);
  const settledEarnings = (ledger.settlements || [])
    .flatMap(s => s.payouts || [])
    .filter(p => p.agent_id === agentId)
    .reduce((s, p) => s + Number(p.amount_atomic), 0);
  
  const totalEarnedAtomic = String(
    Number(earnedFromLedger?.totalAtomic || 0) + settledEarnings
  );
  const totalEarnedUsd = parseFloat((Number(totalEarnedAtomic) / 1e6).toFixed(6));
  
  // Recent payout history
  const recentSettlements = (ledger.settlements || []).reverse().slice(0, 5);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    id: agent.id,
    name: agent.name,
    wallet: agent.wallet,
    apiKey: agent.apiKey,
    referralCode: agent.referralCode,
    plan: agent.plan,
    status: agent.status,
    createdAt: agent.createdAt,
    
    earnings: {
      totalUsd,
      totalAtomic: totalEarnedAtomic,
      pendingAtomic: String(earnedFromLedger?.totalAtomic || 0),
      pendingUsd: earnedFromLedger ? (Number(earnedFromLedger.totalAtomic) / 1e6).toFixed(6) : '0',
      settledUsd: (settledEarnings / 1e6).toFixed(6),
      count: earnedFromLedger?.count || 0,
    },
    
    network: {
      totalReferred: referredAgents.length,
      activeReferred: referredAgents.filter(a => a.status === 'active').length,
    },
    
    recentSettlements: recentSettlements.map(s => ({
      txHash: s.txHash,
      timestamp: s.timestamp,
      count: s.payoutsCount,
      totalUsd: s.totalUsd,
    })),
    
    usage: {
      callsTotal: agent.callsTotal,
      usdcSpent: agent.usdcSpent,
      dailyFreeCalls: agent.freeQuotaDaily,
    },
  }));
}

module.exports = { handleRegister, handleDashboard };

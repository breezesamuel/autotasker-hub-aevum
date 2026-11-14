/**
 * Main API handler — v2: agent registry + x402 paywall + commission tracking
 * 
 * Flow:
 * 1. Check X-Agent-Key header → agent quota (free calls)
 * 2. If no key or quota exceeded → x402 paywall (PAYMENT-REQUIRED 402)
 * 3. If x402 payment verified → serve data + record usage + compute commission
 */

const { handleRegister, handleDashboard } = require('./agents-v2');
const { findAgent, checkQuota, recordCall, setRateLimitHeaders } = require('./middleware');
const { recordPayment } = require('./payments');
const dashboardApi = require('./dashboard');
const paymentsApi = require('./payments-api');

// Use standalone x402 handler for the Aevum entry repo
const x402Handler = require('./x402-standalone');

async function dispatch(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const auth = req.headers['x-agent-key'] || req.headers['authorization'];
  const agent = auth ? findAgent(auth) : null;
  
  // ---- Payments / Dashboard endpoints ----
  if (pathname === '/api/payments/summary' && req.method === 'GET') return paymentsApi.summary(req, res);
  if (pathname === '/api/payments/entries' && req.method === 'GET') return paymentsApi.entries(req, res);
  if (pathname === '/api/payments/payouts' && req.method === 'GET') return paymentsApi.payouts(req, res);
  if (pathname === '/api/payments/batch' && req.method === 'POST') return paymentsApi.batch(req, res);
  if (pathname === '/api/payments/settled' && req.method === 'POST') return paymentsApi.confirmed(req, res);
  
  // ---- Agent management endpoints ----
  if (pathname === '/health' && req.method === 'GET') return dashboardApi.publicStats(req, res); // reuse
  if (pathname === '/api/dashboard/public' && req.method === 'GET') return dashboardApi.publicStats(req, res);
  const agentDashMatch = pathname.match(/^\/api\/dashboard\/agent\/(.+)$/);
  if (agentDashMatch && req.method === 'GET') return handleDashboard(req, res, agentDashMatch[1]);
  if (pathname === '/api/agents/register' && req.method === 'POST') return handleRegister(req, res);
  if (pathname === '/api/agents/stats' && req.method === 'GET') return /* existing */ null;
  
  // Rate limit check for known agents
  if (agent) {
    const qc = checkQuota(agent, pathname);
    setRateLimitHeaders(res, agent, qc);
    
    if (!qc.allowed) {
      if (qc.reason === 'quota_exceeded') {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: 'daily_quota_exceeded',
          message: `Free tier limit reached (${qc.todayCalls}/${qc.quota} calls today). Pay via x402 or share your referral code: ${agent.referralCode || 'N/A'}`,
          quota: qc.quota,
          callsToday: qc.todayCalls,
          referralCode: agent.referralCode,
          sampleUrl: `${req.headers.host}/api/x402/sample?limit=3`,
        }));
      }
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: qc.reason }));
    }
    agent._quotaUsedToday = (agent._quotaUsedToday || 0) + 1;
  }
  
  // ---- x402 paywalled endpoints ----
  if (pathname.startsWith('/api/x402/')) {
    // Hook: after successful response, record payment if paid
    const origEnd = res.end.bind(res);
    let responded = false;
    res.end = function(body) {
      if (responded) return origEnd(body);
      responded = true;
      
      // If this was a paid call (status 200 with PAYMENT-RESPONSE header), record it
      const payResp = res.getHeader('payment-response') || res.getHeader('x-payment-response');
      if (payResp && res.statusCode === 200) {
        try {
          const decoded = JSON.parse(Buffer.from(payResp, 'base64').toString());
          if (decoded.success && agent) {
            // Extract price from request URL
            const priceKey = pathname.replace('/api/x402/', '');
            const PRICE_MAP = { hotlist: 50000, search: 50000, price: 100000, full: 500000 };
            const atomic = String(PRICE_MAP[priceKey] || 50000);
            
            recordPayment({
              agentId: agent.id,
              agentName: agent.name,
              agentWallet: agent.wallet,
              referrerId: agent.referrerId,
              endpoint: pathname,
              priceAtomic: atomic,
              priceUsd: Number(atomic) / 1e6,
              txHash: decoded.transaction || null,
              settledBy: decoded.network || 'eip155:8453',
            });
            
            // Record call against agent quota
            if (agent.dailyLogs) {
              const today = new Date().toISOString().slice(0, 10);
              agent.dailyLogs.push({ date: today, endpoint: pathname, paid: true, amountAtomic: atomic, ts: Date.now() });
            }
            agent.callsTotal = (agent.callsTotal || 0) + 1;
            agent.usdcSpent = parseFloat(((agent.usdcSpent || 0) + Number(atomic) / 1e6).toFixed(6));
            
            // Persist agent changes
            try {
              const agentsData = require('./middleware').loadAgents?.() || null;
              if (!agentsData) {
                const fs = require('fs');
                const path = require('path');
                const af = path.resolve(__dirname, '..', 'data', 'agents.json');
                try {
                  const ad = JSON.parse(fs.readFileSync(af, 'utf8'));
                  const a = ad.agents.find(x => x.id === agent.id);
                  if (a) Object.assign(a, agent);
                  fs.writeFileSync(af, JSON.stringify(ad, null, 2));
                } catch(e) {}
              }
            } catch(e) {}
          }
        } catch(e) { /* ignore parsing errors */ }
      }
      
      return origEnd(body);
    };
    
    return x402Handler.default(req, res);
  }
  
  // Proxy x402 root for MCP
  if (pathname === '/api/x402' && req.method === 'POST') {
    return x402Handler.default(req, res);
  }
  
  // Default
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found', path: pathname }));
}

module.exports = { dispatch };

if (require.main === module) {
  const http = require('http');
  const server = http.createServer((req, res) => {
    dispatch(req, res).catch(e => {
      console.error('[error]', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal', message: e.message }));
    });
  });
  
  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => {
    console.log(`\n🚀 AutoTasker Hub Aevum Entry`);
    console.log(`   Local:     http://localhost:${PORT}`);
    console.log(`   Health:    http://localhost:${PORT}/health`);
    console.log(`   Register:  POST http://localhost:${PORT}/api/agents/register`);
    console.log(`   Summary:   http://localhost:${PORT}/api/payments/summary`);
    console.log(`   Payouts:   http://localhost:${PORT}/api/payments/payouts`);
    console.log(`   Sample:    http://localhost:${PORT}/api/x402/sample?limit=3`);
    console.log(``);
  });
}

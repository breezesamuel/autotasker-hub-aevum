#!/usr/bin/env node
/**
 * Simple HTTP server for local testing / standalone deployment
 */

const http = require('http');
const dashboardApi = require('./api/dashboard');
const paymentsApi = require('./api/payments-api');
const walletApi = require('./api/wallet');
const { handleRegister, handleDashboard } = require('./api/agents-v2');
const { dispatch } = require('./api/index');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Payments overview
  if (url.pathname === '/api/payments/summary' && req.method === 'GET') return paymentsApi.summary(req, res);
  if (url.pathname === '/api/payments/payouts' && req.method === 'GET') return paymentsApi.payouts(req, res);
  if (url.pathname === '/api/payments/batch' && req.method === 'POST') return paymentsApi.batch(req, res);
  
  // Wallet/revenue dashboard
  if (url.pathname === '/api/wallet' && req.method === 'GET') return walletApi.wallet(req, res);
  
  // Agent dashboard
  const agentMatch = url.pathname.match(/^\/api\/dashboard\/agent\/(.+)$/);
  if (agentMatch && req.method === 'GET') return handleDashboard(req, res, agentMatch[1]);
  
  // Main dispatch
  dispatch(req, res).catch(err => {
    console.error('[server error]', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal', message: err.message }));
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 AutoTasker Hub Aevum Entry`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   Register:  curl -X POST http://localhost:${PORT}/api/agents/register \\`);
  console.log(`                 -H "Content-Type: application/json" \\`);
  console.log(`                 -d '{"name":"test","wallet":"0x74a9...cf5d8","referral_code":"YOUR-CODE"}'`);
  console.log(`   Wallet:    http://localhost:${PORT}/api/wallet`);
  console.log(`   Payouts:   http://localhost:${PORT}/api/payments/payouts`);
  console.log(`   Summary:   http://localhost:${PORT}/api/payments/summary`);
  console.log(`   Sample:    http://localhost:${PORT}/api/x402/sample?limit=3`);
  console.log(`\n💰 Revenue split: House 90% | Referrer 10% | Facilitator 50bps`);
  console.log(`\n`);
});

process.on('SIGINT', () => { console.log('\nShutting down...'); server.close(() => process.exit(0)); });

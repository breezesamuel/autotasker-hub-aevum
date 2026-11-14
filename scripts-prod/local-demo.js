#!/usr/bin/env node
/**
 * 本地启动演示 — 为 swap.io bonus 视频做准备
 * 运行: node scripts/local-demo.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3042;

console.log('\n' + '═'.repeat(68));
console.log('  AutoTasker Hub — Local Demo Server');
console.log('  启动后请访问 http://localhost:' + PORT);
console.log('═'.repeat(68) + '\n');

// Mock x402 endpoints for local demo
const hotlistData = {
  boards: ['WeiboHot', 'Douban', 'Zhihu', 'Bilibili', 'Tieba'],
  timestamp: new Date().toISOString(),
  note: 'Free sample — no payment required'
};

const prices = [0.05, 0.05, 0.10, 0.50];
const channels = ['DATA_API', 'UNCLAIMED_PROPERTY', 'ESCROW_RELEASE', 'INSURANCE_CLAIMS'];

const server = http.createServer((req, res) => {
  const url = req.url;
  
  if (url === '/api/status') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({
      status: 'operational',
      x402Score: 100,
      totalSettlements: 988,
      grossTUSD8: '805.40',
      velocity: '16.80x',
      contract: '0xDf75267820b1Cc631723bB00da97e7642518e917',
      network: 'QDay Aevum Testnet (chainId 44005)',
    }));
    
  } else if (url === '/api/x402/sample' || url.startsWith('/api/x402/sample')) {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(hotlistData));
    
  } else if (url === '/api/x402/hotlist' || url.startsWith('/api/x402/hotlist')) {
    // Return HTTP 402 with x402 invoice
    const invoice = {
      'Content-Type': 'application/json',
      'X-402-Version': '1',
      'X-Facilitator': 'AutoTaskerHub',
    };
    res.writeHead(402, invoice);
    res.end(JSON.stringify({
      x402Version: 1,
      resource: 'https://autotasker-hub.vercel.app/api/x402/hotlist',
      accepts: [{
        scheme: 'exact',
        network: 'ethereum',
        maxAmountRequired: '50000',  // $0.05 @ 6dp
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  // USDC
        payTo: '0x74a9f91763c28571af7a52987f425f62825cf5d8',
        facilitator: 'AutoTaskerHub',
        description: 'Hotlist snapshot — 5 trending Chinese social media boards',
        mimeType: 'application/json',
      }],
      _comment: 'In real deployment, payer signs and broadcasts USDC transfer to payTo address'
    }));
    
  } else if (url === '/api/pricing') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({
      hotlist: '$0.05',
      search: '$0.05', 
      price: '$0.10',
      full: '$0.50',
      note: 'All payments via x402 — no account needed'
    }));
    
  } else {
    res.writeHead(200, {'Content-Type':'text/html'});
    res.end(`
      <html><body style="font-family:monospace;padding:40px;background:#0a0a0a;color:#0f0">
      <h2>🚀 AutoTasker Hub — Local Demo</h2>
      <p>Endpoints available:</p>
      <ul>
        <li><code>GET /api/status</code> — system health</li>
        <li><code>GET /api/x402/sample?limit=3</code> — free sample (no payment)</li>
        <li><code>GET /api/x402/hotlist</code> — returns HTTP 402 with x402 invoice</li>
        <li><code>GET /api/pricing</code> — price list</li>
      </ul>
      <p style="color:#888;margin-top:40px;">Contract: 0xDf752678...8e917 on QDay Aevum<br>
      Settlements: 988 | Gross: $805.40 tUSD8 | Velocity: 16.8x</p>
      </body></html>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`\n  For video recording, open:`);
  console.log(`  1. http://localhost:${PORT}/api/x402/hotlist  (shows 402)`);
  console.log(`  2. http://localhost:${PORT}/api/status         (shows 988 settlements)`);
  console.log(`  3. http://localhost:${PORT}                    (landing page)`);
  console.log(`\n  Then run: curl http://localhost:${PORT}/api/x402/hotlist`);
  console.log('Press Ctrl+C to stop\n');
});

#!/usr/bin/env node
/**
 * x402 Health Monitor — Automatically checks our endpoints every hour
 * Sends email alert if score drops below 95
 */
const fs = require('fs');
const path = require('path');
const { smtpSend } = require('../lib/smtp');

const CFG = { host: 'smtp.qq.com', port: 465, user: '460123249@qq.com', pass: 'namnbldayykicaji' };
const FROM = '460123249@qq.com';
const TO = '460123249@qq.com'; // Self-alert
const ENDPOINTS = [
  'https://autotasker-hub.vercel.app/api/x402/hotlist',
  'https://autotasker-hub.vercel.app/api/x402/search',
  'https://autotasker-hub.vercel.app/api/x402/price',
  'https://autotasker-hub.vercel.app/api/x402/full',
];

async function checkEndpoint(url) {
  try {
    const r = await fetch(`https://x402-agent-pay.com/facilitator/report?url=${encodeURIComponent(url)}`, {
      headers: { 'user-agent': 'autotasker-health-monitor' },
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json();
    return { url, score: j.score, verdict: j.verdict, defects: j.defects?.map(d => d.code) || [], latency_ms: j.latency_ms };
  } catch (e) {
    return { url, error: e.message };
  }
}

(async () => {
  console.log('=== Health Check ===\n');
  const results = await Promise.all(ENDPOINTS.map(checkEndpoint));
  
  let alert = false;
  let alertMsg = '';
  
  for (const r of results) {
    if (r.error) {
      console.log(`✗ ${r.url} → ERR: ${r.error}`);
      alert = true;
      alertMsg += `${r.url} ERROR: ${r.error}\n`;
    } else {
      const icon = r.score >= 95 ? '✓' : '⚠';
      console.log(`${icon} ${r.url.replace('https://autotasker-hub.vercel.app', '')} → score:${r.score} verdict:${r.verdict}${r.defects.length ? ' defects:[' + r.defects.join(',') + ']' : ''}`);
      if (r.score < 95) {
        alert = true;
        alertMsg += `Score dropped to ${r.score} on ${r.url}\nDefects: ${r.defects.join(', ')}`;
      }
    }
  }
  
  // Save result
  const outDir = path.resolve(__dirname, '..', 'data', 'recon');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'health-check.json'), JSON.stringify({
    at: new Date().toISOString(),
    results,
    allHealthy: !alert,
  }, null, 2));
  
  // Send alert if needed
  if (alert) {
    try {
      await smtpSend(CFG, { from: FROM, to: TO, subject: '[ALERT] AutoTasker Hub health check failed', text: alertMsg });
      console.log('\n📧 Alert email sent!');
    } catch (e) {
      console.log('\n⚠️ Failed to send alert:', e.message);
    }
  } else {
    console.log('\n✅ All endpoints healthy!');
  }
})();

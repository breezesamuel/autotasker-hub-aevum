#!/usr/bin/env node
/**
 * revenue-guard-24x7.js — 不间断收入保障守护
 *
 * 职责（真·24/7 常驻，不是空喊）:
 *   1. 存活: 每 CYCLE_MS 检查 x402 服务 :8795; 挂了用 detached 子进程重起 server.js。
 *   2. 收款完整性: 抽样 N 个付费工具，未付款调用必须返回 HTTP 402 且 payTo = 唯一金库地址;
 *      若任何工具变成免费/改址 => 立即 ALERT（收入泄漏）。
 *   3. 真实入账: 读 /api/x402/proof 的 settledCount + totalRevenueUsd，如实记账（0 就是 0，不刷单）。
 *   4. 视频 URL: 截止时间 2026-12-11T08:00Z 前每轮探测 GitHub raw MP4; 失效写 ALERT。
 *   5. 心跳: 写 data/revenue-guard-heartbeat.json + 追加 data/revenue-guard.log。
 *
 * 不移动资金、不认领无主资产、不绕过管控、不虚构收入。
 *
 * Usage:
 *   node scripts/revenue-guard-24x7.js --once     # 单轮自检
 *   node scripts/revenue-guard-24x7.js            # 常驻循环
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const ROOT = 'F:\\2026\\第二次点子';
const REPO = path.join(ROOT, 'repos', 'autotasker-hub-aevum');
const DATA = path.join(ROOT, 'data');
const HEARTBEAT = path.join(DATA, 'revenue-guard-heartbeat.json');
const LOG = path.join(DATA, 'revenue-guard.log');
const ALERT = path.join(DATA, 'revenue-guard-alert.log');
const SERVER = path.join(REPO, 'server.js');
const BASE = 'http://127.0.0.1:8795';
const PAYTO = '0xb9a9e6d9c4ad1635aa685bba2e235a515a94773c';
const VIDEO_URL = 'https://raw.githubusercontent.com/breezesamuel/autotasker-hub-aevum/main/data/demo/autotasker-qday-demo-compressed.mp4';
const VIDEO_DEADLINE = Date.parse('2026-12-11T08:00:00Z');
const CYCLE_MS = 5 * 60 * 1000;
const ONCE = process.argv.includes('--once');

// Paid tool sample — one from each money layer L25–L35 + core
const SAMPLE_TOOLS = [
  'asset_catalog_search', 'agent_delegate_task', 'defi_protocol_risk_score',
  'llama_live_price', 'bridge_cost_estimate', 'wallet_balance_scan',
  'chinese_social_baidu_hot', 'stablecoin_depeg_alert', 'china_market_index_live',
  'yield_stablecoin_scan', 'global_fx_rate',
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (_) {}
}
function alert(msg) {
  const line = `[${new Date().toISOString()}] ALERT ${msg}`;
  console.error(line);
  try { fs.appendFileSync(ALERT, line + '\n', 'utf8'); } catch (_) {}
}
function getJSON(url, ms = 10000, opts) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, Object.assign({ timeout: ms }, opts || {}), (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (_) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', e => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
function postJSON(url, payload, ms = 10000) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request(url, { method: 'POST', timeout: ms,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}
function findPayTo(obj, depth) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  if (obj.accepts && Array.isArray(obj.accepts)) return String((obj.accepts[0] || {}).payTo || '').toLowerCase();
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.trim().startsWith('{')) {
      let n; try { n = JSON.parse(v); } catch (_) { continue; }
      const r = findPayTo(n, depth + 1); if (r) return r;
    } else if (v && typeof v === 'object') {
      const r = findPayTo(v, depth + 1); if (r) return r;
    }
  }
  return null;
}
function respawnServer() {
  const out = fs.openSync(path.join(DATA, 'x402-server.out.log'), 'a');
  const err = fs.openSync(path.join(DATA, 'x402-server.err.log'), 'a');
  const child = spawn(process.execPath, [SERVER], { cwd: REPO, detached: true,
    stdio: ['ignore', out, err], windowsHide: true });
  child.unref();
  log(`server respawned pid=${child.pid}`);
}
function probeVideoOnce() {
  return new Promise((resolve) => {
    const req = https.get(VIDEO_URL, { headers: { Range: 'bytes=0-0', 'user-agent': 'Mozilla/5.0' }, timeout: 8000 }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode === 206 || res.statusCode === 200, status: res.statusCode });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}
async function probeVideo() {
  // retry 3x to avoid false ALERTs from transient GFW timeouts
  let last = { ok:false, error:'no-attempt' };
  for (let i = 0; i < 3; i++) {
    last = await probeVideoOnce();
    if (last.ok) return { ok:true, status:last.status, attempts:i+1 };
    await new Promise(r => setTimeout(r, 1000));
  }
  return last;
}

async function cycle() {
  const state = { at: new Date().toISOString(), checks: {} };

  // 1) liveness
  const st = await getJSON(BASE + '/api/status');
  state.checks.server = st && st.status === 200 ? 'UP' : 'DOWN';
  if (state.checks.server === 'DOWN') {
    alert('x402 server down -> respawning');
    respawnServer();
    state.checks.server = 'RESPAWNED';
  } else {
    state.checks.toolCount = st.body && st.body.toolCount;
    state.checks.payTo = st.body && st.body.payTo;
  }

  // 2+3) revenue integrity + honest accounting
  const proof = await getJSON(BASE + '/api/x402/proof');
  if (proof && proof.body && proof.body.ok) {
    state.checks.settledCount = proof.body.settledCount;
    state.checks.revenueUsd = proof.body.totalRevenueUsd;
    state.checks.proofPayTo = proof.body.payTo;
    if (String(proof.body.payTo || '').toLowerCase() !== PAYTO) {
      alert(`payTo DRIFT in proof: ${proof.body.payTo}`);
    }
  }

  // payTo integrity sample (only when server up) — stratified across FULL live catalog
  if (state.checks.server === 'UP') {
    let sample = SAMPLE_TOOLS.slice();
    try {
      const lr = await postJSON(BASE + '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      if (lr) {
        const lj = JSON.parse(lr.body);
        const all = ((lj.result && lj.result.tools) || []).map(t => t.name).filter(n => n && n !== 'sample_free');
        if (all.length) {
          const seen = new Set(sample);
          const step = Math.max(1, Math.floor(all.length / 40));
          for (let i = 0; i < all.length; i += step) { if (!seen.has(all[i])) { sample.push(all[i]); seen.add(all[i]); } }
          for (const n of all.slice(-12)) { if (!seen.has(n)) { sample.push(n); seen.add(n); } }
        }
      }
    } catch (_) {}
    let leaks = [];
    for (const name of sample) {
      const r = await postJSON(BASE + '/mcp/tools/call', { name, arguments: {} });
      if (!r) { leaks.push(name + ':no-response'); continue; }
      let body; try { body = JSON.parse(r.body); } catch (_) { body = null; }
      const pay = findPayTo(body, 0);
      if (r.status !== 402 || pay !== PAYTO) {
        leaks.push(`${name}:http=${r.status},payTo=${pay}`);
      }
    }
    state.checks.toolIntegrity = leaks.length ? 'LEAK:' + leaks.join('|') : `OK(${sample.length}/${sample.length} gated to treasury)`;
    if (leaks.length) alert('revenue leak detected: ' + leaks.join(', '));
  }

  // 4) video URL until deadline
  if (Date.now() < VIDEO_DEADLINE) {
    const v = await probeVideo();
    state.checks.video = v.ok ? 'OK' : 'ALERT:' + (v.error || v.status);
    if (!v.ok) alert('demo video URL unreachable — DoraHacks link needs attention');
  } else {
    state.checks.video = 'DEADLINE_PASSED';
  }

  try { fs.writeFileSync(HEARTBEAT, JSON.stringify(state, null, 2), 'utf8'); } catch (_) {}
  log(`cycle: server=${state.checks.server} tools=${state.checks.toolCount} settled=${state.checks.settledCount} rev=$${state.checks.revenueUsd} integrity=${state.checks.toolIntegrity} video=${state.checks.video}`);
  return state;
}

(async () => {
  await cycle();
  if (!ONCE) {
    log(`24x7 guard armed — cycle every ${CYCLE_MS / 60000} min; deadline ${new Date(VIDEO_DEADLINE).toISOString()}`);
    setInterval(cycle, CYCLE_MS);
  }
})();

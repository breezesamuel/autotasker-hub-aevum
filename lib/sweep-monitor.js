/**
 * sweep-monitor.js — 金库余额监控 + 自动扫款提醒
 *
 * 每6小时检查一次金库余额。当余额达到或超过阈值时发送通知，
 * 提示用户执行扫款操作。同时追踪"已发现但未回收"的沉睡资产规模。
 *
 * 触发条件（任一满足即告警）：
 *   - 金库 USDC >= $5        → medium alert (接近可分配门槛)
 *   - 金库 USDC >= $10       → high alert (可分配，需扫款完成)
 *   - 累计沉睡资产 > $100    → urgent alert (长期未动的大额资金)
 *   - x402结算首次到账       → congratulatory alert
 *
 * 端点：
 *   GET  /api/sweep/status     — 当前监控状态和阈值检查
 *   POST /api/sweep/trigger    — 手动触发一次扫描（用于测试）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'data', 'sweep-monitor.json');
const TREASURY_ADDR = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

// Thresholds
const THRESHOLDS = {
  nearFloor:    5,   // $5 — approaching allocation floor
  allocFloor:   10,  // $10 — allocation ready
  majorFind:    100, // $100 — significant dormant assets found
};

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (e) {
    return {
      version: 1,
      lastChecked: null,
      treasuryBalanceUsd: 0,
      dormantAssetsUsd: 162.93, // from dormant-finder scan
      alertsTriggered: [],
      firstSettlementAt: null,
      settlementCountSinceLastCheck: 0,
    };
  }
}
function saveState(s) {
  s.lastChecked = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e) {}
}

// Check on-chain treasury balance (lightweight — single eth_call)
async function checkTreasuryBalance() {
  const https = require('https');
  const RPC = 'https://mainnet.base.org';
  const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const addrPad = TREASURY_ADDR.replace(/^0x/i,'').toLowerCase().padStart(64,'0');

  return new Promise((resolve) => {
    const body = JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:USDC,data:'0x70a08231'+addrPad},'latest']});
    const req = https.request(RPC, {method:'POST',timeout:8000,
      headers:{'content-type':'application/json','Content-Length':Buffer.byteLength(body)}}, res=>{
      let b='';res.on('data',c=>b+=c);res.on('end',()=>{
        try{
          const j=JSON.parse(b);
          if(j.error)return resolve({error:j.error.message,usdc:0});
          const raw=j.result||'0x0';
          const usdc=parseInt(raw,16)/1e6;
          resolve({usdc,error:null});
        }catch(e){resolve({error:'parse_error',usdc:0});}
      });
    });
    req.on('error',e=>resolve({error:e.message,usdc:0}));
    req.on('timeout',()=>{req.destroy();resolve({error:'timeout',usdc:0});});
    req.write(body);req.end();
  });
}

// Check if any new settlements occurred (compare with ledger count)
function getSettlementDelta() {
  try {
    const pay = require('./payments');
    const ledger = pay.loadLedger();
    const state = loadState();
    const current = (ledger.entries || []).length;
    const delta = current - state.settlementCountSinceLastCheck;
    return delta;
  } catch (e) { return 0; }
}

function evaluateAlerts(state) {
  const alerts = [];
  const { treasuryBalanceUsd, dormantAssetsUsd, firstSettlementAt } = state;

  // 1) Treasury just crossed allocation floor
  if (treasuryBalanceUsd >= THRESHOLDS.allocFloor && treasuryBalanceUsd < THRESHOLDS.allocFloor + 0.01) {
    alerts.push({ type:'floor-reached', severity:'high',
      message:`Treasury hit $${treasuryBalanceUsd.toFixed(2)} — 30/60/10 allocation FLOORED! First land external revenue, then execute sweep.` });
  }

  // 2) Near floor warning
  if (treasuryBalanceUsd >= THRESHOLDS.nearFloor && treasuryBalanceUsd < THRESHOLDS.allocFloor) {
    alerts.push({ type:'near-floor', severity:'medium',
      message:`Treasury at $${treasuryBalanceUsd.toFixed(2)}, need $${(THRESHOLDS.allocFloor-treasuryBalanceUsd).toFixed(2)} more to unlock allocation.` });
  }

  // 3) Dormant assets are large and untouched
  if (dormantAssetsUsd >= THRESHOLDS.majorFind) {
    alerts.push({ type:'dormant-rich', severity:'urgent',
      message:`$${dormantAssetsUsd.toFixed(2)} in dormant wallets found but NOT yet swept. Execute sweep to activate $${(dormantAssetsUsd*0.6).toFixed(2)} compound bucket.` });
  }

  // 4) New settlement detected
  if (state.settlementCountSinceLastCheck > 0) {
    alerts.push({ type:'new-settlement', severity:'info',
      message:`${state.settlementCountSinceLastCheck} new x402 settlement(s) since last check. Treasury growing!` });
  }

  // 5) First settlement ever
  if (firstSettlementAt && !state._notifiedFirst) {
    state._notifiedFirst = true;
    alerts.push({ type:'first-settlement', severity:'celebration',
      message:`🎉 FIRST SETTLEMENT DETECTED at ${firstSettlementAt}! Revenue engine is LIVE.` });
  }

  return alerts;
}

async function runScan() {
  const state = loadState();
  const result = await checkTreasuryBalance();

  state.treasuryBalanceUsd = Math.max(0, result.usdc || 0);
  state.settlementCountSinceLastCheck = getSettlementDelta();
  state.checkResult = { error: result.error, timestamp: new Date().toISOString() };

  // v13: sync dormant assets from the dormant-finder output so alert evaluation
  // uses live data instead of the stale boot default (was stuck at $0 after the
  // state file was created without a scan). Sum = base + ethereum USDC.
  try {
    const dorm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dormant-assets.json'), 'utf8'));
    if (dorm && Array.isArray(dorm.results)) {
      const live = dorm.results
        .filter(r => r && (r.chain === 'base' || r.chain === 'ethereum'))
        .reduce((sum, r) => sum + (Number(r.usdc) || 0), 0);
      if (live > 0) state.dormantAssetsUsd = Math.round(live * 100) / 100;
      state.dormantAssetsScannedAt = dorm.scannedAt || null;
    }
  } catch (e) { /* no scan file yet — keep previous value */ }

  // Update first settlement time if not set
  if (!state.firstSettlementAt) {
    try {
      const pay = require('./payments');
      const ledger = pay.loadLedger();
      const ts = (ledger.entries || []).map(e => e.ts).filter(Boolean).sort();
      if (ts.length > 0) state.firstSettlementAt = ts[0];
    } catch (e) {}
  }

  const alerts = evaluateAlerts(state);
  state.alertsTriggered = [...alerts.slice(-20), ...(state.alertsTriggered || [])].slice(-50);

  saveState(state);

  return {
    ok: true,
    treasuryBalanceUsd: state.treasuryBalanceUsd,
    treasuryAddr: TREASURY_ADDR,
    dormantAssetsUsd: state.dormantAssetsUsd,
    settlementCountSinceLastCheck: state.settlementCountSinceLastCheck,
    alerts,
    thresholds: THRESHOLDS,
    allocationReady: state.treasuryBalanceUsd >= THRESHOLDS.allocFloor,
    sweepRecommendation: getSweepRecommendation(state),
    lastChecked: state.lastChecked,
  };
}

function getSweepRecommendation(state) {
  if (state.treasuryBalanceUsd >= THRESHOLDS.allocFloor) return { action:'none', note:'Allocation already active — no sweep needed.' };
  if (state.dormantAssetsUsd > 0) {
    return {
      action:'sweep-required',
      estimatedSweepAmount: state.dormantAssetsUsd.toFixed(2),
      steps: [
        '1. Stop any drip/recurrence script sending from 0x367F',
        '2. Transfer 0.0002 ETH from 0x367F to 0xFC24 (gas)',
        '3. Send MAX USDC from each of 3 wallets to ' + TREASURY_ADDR,
        '4. Submit 3 txHashes to /api/sweep/confirm',
      ],
      docLink: '/docs/USDC-RECOVERY-RUNBOOK-2026-11-14.md',
    };
  }
  return { action:'wait-x402', note:'No dormant assets found. Waiting for first x402 settlement.' };
}

function getStatus() {
  const state = loadState();
  return {
    ...state,
    treasuryBalanceUsd: state.treasuryBalanceUsd || 0,
    dormantAssetsUsd: state.dormantAssetsUsd || 0,
    allocationReady: (state.treasuryBalanceUsd || 0) >= THRESHOLDS.allocFloor,
    latestAlerts: (state.alertsTriggered || []).slice(-5).reverse(),
  };
}

module.exports = { runScan, getStatus, checkTreasuryBalance, THRESHOLDS, TREASURY_ADDR };

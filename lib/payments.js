/**
 * Payment & Commission Engine
 * 
 * Handles:
 * 1. Recording every paid call with settlement proof
 * 2. Computing referrer commissions in real-time
 * 3. Tracking pending payouts (batched for AgentPay settlement)
 * 4. Generating payout batch payloads for AgentPay /facilitator/payees/net
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data', 'payments');
// Serverless filesystems are read-only; fall back to /tmp so a settled payment can
// still be recorded without crashing the response.
const WRITABLE = process.env.LEDGER_DIR
  || (process.env.VERCEL ? '/tmp' : DATA_DIR);
const LEDGER_FILE = path.join(WRITABLE, 'ledger.json');
const WALLET_FILE = path.join(__dirname, '..', 'config', 'keys', 'x402-wallet.json');

// ---- Constants ----
const HOUSE_CUT_BPS = 9000;    // 90% to house
const REFERREER_CUT_BPS = 1000; // 10% to referrer
const TOTAL_BPS = 10000;
const FACILITATOR_FEE_BPS = 50; // 50bps AgentPay fee
const MIN_PAYOUT_ATOMIC = 50000; // $0.05 minimum before auto-payout trigger
const BATCH_MIN_USD = 0.50;      // Minimum net batch threshold

// Our wallets
let payoutWallet = null;
try {
  const w = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
  payoutWallet = w.address;
} catch (e) { console.error('[payment] No payout wallet configured:', e.message); }

// ---- Ledger Schema ----
// ledger.entries[] = {
//   id, ts, agentId, agentName, agentWallet, referrerId, endpoint, priceAtomic,
//   priceUsd, txHash, network, settledBy, commissionHouseAtomic, commissionRefAtomic
// }
// ledger.pendingPayouts[] = {
//   agentId, agentWallet, name, totalAtomic, count
// }
// ledger.config = { houseWallet, createdAt, version }

function loadLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  } catch (e) {
    const ledger = {
      entries: [],
      pendingPayouts: [],
      config: {
        houseWallet: payoutWallet || '0x74a9f91763c28571af7a52987f425f62825cf5d8',
        houseCutBps: HOUSE_CUT_BPS,
        referrerCutBps: REFERREER_CUT_BPS,
        facilityFeeBps: FACILITATOR_FEE_BPS,
        minPayoutAtomic: MIN_PAYOUT_ATOMIC,
        createdAt: new Date().toISOString(),
        version: 1,
      },
      stats: {
        totalCalls: 0,
        totalRevenueAtomic: '0',
        totalRevenueUsd: 0,
        totalReferrerPayoutsAtomic: '0',
        totalReferrerPayoutsUsd: 0,
        settledCount: 0,
      },
    };
    saveLedger(ledger);
    return ledger;
  }
}

function saveLedger(ledger) {
  try {
    fs.mkdirSync(WRITABLE, { recursive: true });
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
  } catch (e) {
    console.error('[payment] cannot persist ledger at', LEDGER_FILE, '-', e.message,
      '(the on-chain tx is still the source of truth)');
  }
}

/**
 * Record a completed paid call — called after successful x402 settle
 * 
 * @param {Object} params
 * @param {string} params.agentId - who paid
 * @param {string} params.agentName - display name
 * @param {string} params.agentWallet - their wallet
 * @param {string|null} params.referrerId - who referred them (null = direct)
 * @param {string} params.endpoint - which endpoint was called
 * @param {string} params.priceAtomic - amount in USDC atomic units (6 decimals)
 * @param {number} params.priceUsd - human-readable USD value
 * @param {string|null} params.txHash - on-chain transaction hash
 * @param {string|null} params.settledBy - facilitator URL used
 * @returns {Object} record with computed commission split
 */
function recordPayment(params) {
  const ledger = loadLedger();
  const now = new Date().toISOString();
  
  // Compute commission split
  const houseAtomic = Math.floor(Number(params.priceAtomic) * HOUSE_CUT_BPS / TOTAL_BPS);
  const referrerAtomic = Number(params.priceAtomic) - houseAtomic;
  const houseUsd = parseFloat((Number(params.priceAtomic) * HOUSE_CUT_BPS / TOTAL_BPS / 1e6).toFixed(6));
  const referrerUsd = parseFloat((referrerAtomic / 1e6).toFixed(6));
  
  const entry = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: now,
    agentId: params.agentId,
    agentName: params.agentName || 'unknown',
    agentWallet: params.agentWallet || 'anonymous',
    referrerId: params.referrerId || null,
    endpoint: params.endpoint,
    priceAtomic: params.priceAtomic,
    priceUsd: params.priceUsd,
    txHash: params.txHash || null,
    network: params.network || 'eip155:8453',
    settledBy: params.settledBy || 'https://x402-agent-pay.com/facilitator',
    commissionHouseAtomic: String(houseAtomic),
    commissionHouseUsd: houseUsd,
    commissionRefAtomic: String(referrerAtomic),
    commissionRefUsd: referrerUsd,
  };
  
  ledger.entries.push(entry);
  
  // Update global stats
  ledger.stats.totalCalls++;
  ledger.stats.totalRevenueAtomic = String(
    Number(ledger.stats.totalRevenueAtomic) + Number(params.priceAtomic)
  );
  ledger.stats.totalRevenueUsd = parseFloat(
    (Number(ledger.stats.totalRevenueUsd) + params.priceUsd).toFixed(6)
  );
  
  // Track referrer commission in pending payouts
  if (params.referrerId && referrerAtomic > 0) {
    const existing = ledger.pendingPayouts.find(p => p.agentId === params.referrerId);
    if (existing) {
      existing.totalAtomic = String(Number(existing.totalAtomic) + referrerAtomic);
      existing.count++;
      existing.lastPayment = now;
      existing.lastAmountAtomic = String(referrerAtomic);
    } else {
      // Need referrer name/wallet — look up from agents file
      let refName = 'unknown';
      let refWallet = null;
      try {
        const agentsData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'agents.json'), 'utf8'));
        const refAgent = agentsData.agents.find(a => a.id === params.referrerId);
        if (refAgent) {
          refName = refAgent.name;
          refWallet = refAgent.wallet;
        }
      } catch (e) {}
      
      ledger.pendingPayouts.push({
        agentId: params.referrerId,
        name: refName,
        wallet: refWallet || null,
        totalAtomic: String(referrerAtomic),
        count: 1,
        createdAt: now,
        lastPayment: now,
        lastAmountAtomic: String(referrerAtomic),
      });
    }
    
    ledger.stats.totalReferrerPayoutsAtomic = String(
      Number(ledger.stats.totalReferrerPayoutsAtomic) + referrerAtomic
    );
    ledger.stats.totalReferrerPayoutsUsd = parseFloat(
      (Number(ledger.stats.totalReferrerPayoutsUsd) + referrerUsd).toFixed(6)
    );
  }
  
  saveLedger(ledger);
  
  console.log(`[payment] ${entry.id} | agent=${params.agentId} | $${params.priceUsd.toFixed(4)} | house=$${houseUsd.toFixed(4)} | ref=$${referrerUsd.toFixed(4)} | tx=${(params.txHash||'pending').slice(0,16)}...`);
  
  return entry;
}

/**
 * Get ledger summary (for dashboard/API)
 */
function getSummary() {
  const ledger = loadLedger();
  const totalUsd = Number(ledger.stats.totalRevenueUsd);
  
  return {
    ...ledger.stats,
    revenueUsd: totalUsd.toFixed(6),
    revenueAtomic: ledger.stats.totalRevenueAtomic,
    houseCutUsd: (totalUsd * HOUSE_CUT_BPS / TOTAL_BPS).toFixed(6),
    referrerPoolUsd: (totalUsd * REFERREER_CUT_BPS / TOTAL_BPS).toFixed(6),
    pendingPayouts: ledger.pendingPayouts.map(p => ({
      ...p,
      totalUsd: (Number(p.totalAtomic) / 1e6).toFixed(6),
      eligible: Number(p.totalAtomic) >= MIN_PAYOUT_ATOMIC,
    })),
    config: ledger.config,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate AgentPay batch settlement payload
 * Called when total pending exceeds threshold
 */
function generateBatchPayload() {
  const ledger = loadLedger();
  const eligible = ledger.pendingPayouts.filter(p => 
    Number(p.totalAtomic) >= MIN_PAYOUT_ATOMIC && p.wallet
  );
  
  if (eligible.length === 0) return { empty: true, message: 'No eligible payouts' };
  
  const batch = eligible.map(p => ({
    payee_wallet: p.wallet,
    amount_usd: (Number(p.totalAtomic) / 1e6).toFixed(6),
    amount_atomic: p.totalAtomic,
    agent_id: p.agentId,
    agent_name: p.name,
    call_count: p.count,
    created_at: p.createdAt,
  }));
  
  const totalUsd = batch.reduce((s, b) => s + parseFloat(b.amount_usd), 0).toFixed(6);
  const totalAtomic = batch.reduce((s, b) => s + Number(b.amount_atomic), 0);
  
  // Build the actual AgentPay settlement request body
  const settlementPayload = {
    batch_id: `batch_${Date.now()}`,
    currency: 'USDC',
    network: 'eip155:8453',
    payee_id: 3, // our payee
    payouts: batch,
    total_atomic: String(totalAtomic),
    total_usd: totalUsd,
    note: 'AutoTasker Hub referral commission batch payout',
  };
  
  return {
    eligibleCount: eligible.length,
    totalAtomic,
    totalUsd,
    batch,
    settlementPayload,
    agentPayEndpoint: 'https://x402-agent-pay.com/facilitator/payees/net',
  };
}

/**
 * Mark payouts as settled after AgentPay confirms
 */
function markSettled(payoutIds, txHash) {
  const ledger = loadLedger();
  let settledTotal = 0;
  
  ledger.pendingPayouts = ledger.pendingPayouts.filter(p => {
    if (payoutIds.includes(p.agentId)) {
      settledTotal += Number(p.totalAtomic);
      ledger.stats.settledCount++;
      return false; // remove from pending
    }
    return true;
  });
  
  // Add settlement record
  if (!ledger.settlements) ledger.settlements = [];
  ledger.settlements.push({
    batchId: `settle_${Date.now()}`,
    txHash,
    timestamp: new Date().toISOString(),
    payoutsCount: payoutIds.length,
    totalAtomic: String(settledTotal),
    totalUsd: (settledTotal / 1e6).toFixed(6),
  });
  
  ledger.stats.totalReferrerPayoutsAtomic = String(
    Number(ledger.stats.totalReferrerPayoutsAtomic) - settledTotal
  );
  ledger.stats.totalReferrerPayoutsUsd = parseFloat(
    (Number(ledger.stats.totalReferrerPayoutsUsd) - settledTotal / 1e6).toFixed(6)
  );
  
  saveLedger(ledger);
  console.log(`[payout] settled ${payoutIds.length} agents, $${(settledTotal/1e6).toFixed(4)}, tx=${txHash?.slice(0,20)}...`);
  return { ok: true, settledCount: payoutIds.length, totalAtomic: String(settledTotal) };
}

module.exports = {
  recordPayment,
  getSummary,
  generateBatchPayload,
  markSettled,
  loadLedger,
  // Constants for external reference
  HOUSE_CUT_BPS,
  REFERREER_CUT_BPS,
  FACILITATOR_FEE_BPS,
  MIN_PAYOUT_ATOMIC,
  BATCH_MIN_USD,
};

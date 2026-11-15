/**
 * airdrop-distributor.js — 空投分配器
 *
 * 金库积累到足够资金后，向早期支持者自动分发空投：
 *   - Top referrers（按推荐带来的结算金额排名）
 *   - Top writers（按gig-rewards质量分排名）
 *   - Early adopters（前N个付费用户）
 *
 * 每次空投从 treasury stable 子账户支出，不影响 compound 复利仓位。
 *
 * Schema:
 *   drop = { id, recipients: [{wallet, amountAtomic}], totalAtomic, reason, createdAt, status }
 *
 * 端点：
 *   POST /api/airdrop/create    — 创建空投批次
 *   GET  /api/airdrop/list      — 历史空投列表
 *   GET  /api/airdrop/:id       — 单批次详情
 *   POST /api/airdrop/execute   — 执行空投（签名+广播，需要私钥）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AIRDROP_FILE = path.join(ROOT, 'data', 'airdrops.json');
const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

function loadAirdrops() {
  try { return JSON.parse(fs.readFileSync(AIRDROP_FILE, 'utf8')); }
  catch (e) { return { version: 1, drops: [], stats: { totalDistributed: 0, batchCount: 0 } }; }
}
function saveAirdrops(d) {
  d.stats.totalDistributed = d.stats.totalDistributed || 0;
  d.stats.batchCount = d.stats.batchCount || 0;
  try {
    fs.mkdirSync(path.dirname(AIRDROP_FILE), { recursive: true });
    fs.writeFileSync(AIRDROP_FILE, JSON.stringify(d, null, 2));
  } catch (e) {}
}

// Select recipients based on criteria
function selectRecipients(criteria) {
  criteria = criteria || {};
  const source = criteria.source;
  const limit = criteria.limit || 10;
  const minWeight = criteria.minWeight || 0;

  const recipients = [];

  // Source: referrals — pick top referrers by attributed payments
  if (source === 'referrals' || source === 'all') {
    try {
      const db = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'data', 'referrals.json'), 'utf8'));
      const entries = Object.values(db.codes || {}).filter(c => c.attributedPayments > 0);
      entries.sort((a, b) => b.attributedPayments - a.attributedPayments);
      for (const code of entries.slice(0, limit)) {
        recipients.push({
          wallet: (code.ownerWallet || '').toLowerCase() || '',
          weight: code.attributedPayments || 1,
          reason: 'top-referrer',
          suggestedAmount: Math.min(5, Number(code.attributedPayments || 0) * 0.05),
        });
      }
    } catch (e) {}
  }

  // Source: gig-writers
  if (source === 'writers' || source === 'all') {
    try {
      const gw = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'data', 'gig-rewards.json'), 'utf8'));
      const writers = Object.entries(gw.writers || {})
        .filter(([_, w]) => w.totalEarnedUsd > 0)
        .sort((a, b) => b[1].totalEarnedUsd - a[1].totalEarnedUsd)
        .slice(0, limit);
      for (const [addr, w] of writers) {
        recipients.push({ wallet: addr.toLowerCase(), weight: w.totalEarnedUsd || 1, reason: 'top-writer', suggestedAmount: Math.min(3, Number(w.totalEarnedUsd) * 0.1) });
      }
    } catch (e) {}
  }

  // Deduplicate & cap at $2 per recipient
  const deduped = new Map();
  for (const r of recipients) {
    if (!r.wallet) continue;
    const existing = deduped.get(r.wallet);
    if (!existing || r.weight > existing.weight) deduped.set(r.wallet, { ...r, suggestedAmount: Math.min(r.suggestedAmount, 2) });
  }
  return Array.from(deduped.values()).slice(0, limit);
}

function createDrop(name, criteria, budgetUsd) {
  const recipients = selectRecipients(criteria);
  if (!recipients.length) return { ok: false, reason: 'no eligible recipients' };

  const totalSuggested = recipients.reduce((s, r) => s + r.suggestedAmount, 0);
  if (totalSuggested > (budgetUsd || 10)) {
    // Scale down proportionally
    const scale = (budgetUsd || 10) / totalSuggested;
    for (const r of recipients) r.suggestedAmount = parseFloat((r.suggestedAmount * scale).toFixed(4));
  }

  const totalUsd = parseFloat(recipients.reduce((s, r) => s + r.suggestedAmount, 0)).toFixed(4);
  const totalAtomic = Math.round(totalUsd * 1e6);

  const drop = {
    id: 'dr_' + Date.now().toString(36),
    name,
    budgetUsd: budgetUsd || 10,
    totalUsd,
    totalAtomic,
    recipients,
    status: 'pending',
    createdAt: new Date().toISOString(),
    executedAt: null,
    txHash: null,
  };

  const d = loadAirdrops();
  d.drops.unshift(drop);
  saveAirdrops(d);
  return { ok: true, drop };
}

function listDrops(status, limit) {
  const d = loadAirdrops();
  const filtered = status ? d.drops.filter(dr => dr.status === status) : d.drops;
  return { drops: filtered.slice(0, limit || 20), total: filtered.length };
}

function executeDrop(id, privateKeyHex) {
  // In production: sign and broadcast USDC transfer via EIP-3009
  // For now: record execution plan and return unsigned payload
  const d = loadAirdrops();
  const drop = d.drops.find(x => x.id === id);
  if (!drop) return { ok: false, reason: 'drop not found' };
  if (drop.status !== 'pending') return { ok: false, reason: 'already ' + drop.status };

  // Build transaction payloads (unsigned EIP-3009 transfers)
  const payloads = drop.recipients.map(r => ({
    wallet: r.wallet,
    amountAtomic: Math.round(r.suggestedAmount * 1e6),
    amountUsd: r.suggestedAmount,
    reason: r.reason,
    nonce: Date.now() + Math.floor(Math.random() * 10000),
  }));

  drop.status = 'executing';
  drop.payloads = payloads;
  saveAirdrops(d);

  return {
    ok: true,
    dropId: id,
    recipientCount: payloads.length,
    totalUsd: drop.totalUsd,
    payloads,
    note: 'Build unsigned EIP-3009 transferWithAuthorization payloads. Sign with private key and submit to relayer.',
    instructions: `Sign each payload with wallet ${TREASURY} using ERC-3009 format, then submit via ${require('./settle-self')?.FACILITATOR_URL || 'facilitator'}`,
  };
}

function confirmExecution(id, txHash) {
  const d = loadAirdrops();
  const drop = d.drops.find(x => x.id === id);
  if (!drop) return { ok: false, reason: 'not found' };
  drop.status = 'completed';
  drop.executedAt = new Date().toISOString();
  drop.txHash = txHash;
  d.stats.totalDistributed = (parseFloat(d.stats.totalDistributed||0) + parseFloat(drop.totalUsd||0)).toFixed(4);
  d.stats.batchCount++;
  saveAirdrops(d);
  return { ok: true, drop };
}

function getStats() {
  const d = loadAirdrops();
  return {
    totalDrops: d.drops.length,
    pendingDrops: d.drops.filter(x => x.status === 'pending').length,
    completedDrops: d.drops.filter(x => x.status === 'completed').length,
    totalDistributedUsd: d.stats.totalDistributed || 0,
    recentDrops: d.drops.slice(0, 5),
  };
}

// ── v15: auto-execution (gated, dry-run by default) ─────────────────────────
// Execution path: DIRECT ERC20 transfer via ethers (NOT EIP-3009 relay) —
// the treasury key in config/keys/pay-to-new.json signs USDC.transfer on Base.
// Gates (ALL must pass, checked live):
//   1. AIRDROP_AUTOEXEC=1 env
//   2. treasury key file present + readable
//   3. signer address === PAY_TO treasury (NEVER move funds otherwise)
//   4. treasury USDC on Base ≥ $20 (keep a floor; drops are small)
//   5. gas available on treasury (ETH ≥ floor)
//   6. a pending drop exists
// dry-run (default) returns plan + per-gate state and moves NOTHING.
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const MIN_TREASURY_USDC = 20;
const MIN_GAS_ETH = 0.00005;

function findKeyField(obj) {
  const candidates = ['privateKey', 'private_key', 'pk', 'secretKey', 'key'];
  for (const k of candidates) {
    if (typeof obj[k] === 'string' && /^0x[0-9a-fA-F]{64}$/.test(obj[k])) return obj[k];
  }
  for (const v of Object.values(obj || {})) {
    if (v && typeof v === 'object') { const f = findKeyField(v); if (f) return f; }
  }
  return null;
}

function loadTreasuryKey() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'keys', 'pay-to-new.json'), 'utf8'));
    return findKeyField(j); // never log or return this outside signer construction
  } catch (e) { return null; }
}

function short(addr) { return addr ? (addr.slice(0, 6) + '…' + addr.slice(-4)) : 'unknown'; }

async function autoExecute(opts) {
  const real = !!(opts && opts.real);
  const gates = [];
  const gate = (name, pass, detail) => gates.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });

  let ethers = null;
  try { ethers = require('ethers'); } catch (e) {}
  gate('ethers available', !!ethers, ethers ? ethers.version : 'not installed');

  const envOk = process.env.AIRDROP_AUTOEXEC === '1';
  gate('env AIRDROP_AUTOEXEC=1', envOk, envOk ? 'on' : 'off (dry-run only)');

  const key = loadTreasuryKey();
  gate('treasury key present', !!key, key ? 'config/keys/pay-to-new.json' : 'missing/unreadable');

  let signerAddr = null;
  if (key && ethers) {
    try { signerAddr = new ethers.Wallet(key).address; } catch (e) {}
  }
  const signerMatches = !!signerAddr && signerAddr.toLowerCase() === TREASURY.toLowerCase();
  gate('signer === treasury', signerMatches, short(signerAddr) + ' vs ' + short(TREASURY));

  const d = loadAirdrops();
  const drop = d.drops.find(x => x.status === 'pending');
  gate('pending drop', !!drop, drop ? drop.id + ' $' + drop.totalUsd : 'none');

  let treasuryUsdc = null, gasEth = null;
  if (ethers && signerMatches) {
    try {
      const provider = new ethers.JsonRpcProvider(BASE_RPC);
      const usdc = new ethers.Contract(USDC_BASE, ERC20_ABI, provider);
      treasuryUsdc = Number(await usdc.balanceOf(TREASURY)) / 1e6;
      gate('treasury USDC ≥ $' + MIN_TREASURY_USDC, treasuryUsdc >= MIN_TREASURY_USDC, '$' + (treasuryUsdc == null ? '?' : treasuryUsdc.toFixed(2)));
      gasEth = Number(await provider.getBalance(TREASURY)) / 1e18;
      gate('gas available ≥ ' + MIN_GAS_ETH + ' ETH', gasEth >= MIN_GAS_ETH, (gasEth == null ? '?' : gasEth.toFixed(6)) + ' ETH');
    } catch (e) {
      gate('on-chain check', false, String(e.message).slice(0, 80));
    }
  }

  const allPass = gates.every(g => g.pass);

  if (!real || !allPass) {
    return {
      ok: true,
      dryRun: true,
      realRequested: real,
      allGatesPass: allPass,
      gates,
      plan: drop ? { dropId: drop.id, name: drop.name, recipients: drop.recipients.length, totalUsd: drop.totalUsd, network: 'Base', asset: 'USDC' } : null,
      note: 'dry-run — no funds moved. Execute needs: real:true + AIRDROP_AUTOEXEC=1 + all gates pass.',
    };
  }

  // REAL execution — sequential direct ERC20 transfers, ~$0.01 gas each on Base
  const wallet = new ethers.Wallet(key, new ethers.JsonRpcProvider(BASE_RPC));
  const usdc = new ethers.Contract(USDC_BASE, ERC20_ABI, wallet);
  const items = drop.payloads || drop.recipients.map(r => ({ wallet: r.wallet, amountAtomic: Math.round(r.suggestedAmount * 1e6) }));
  const results = [];
  let sent = 0, failed = 0, skipped = 0;
  for (const p of items) {
    if (!ethers.isAddress(p.wallet)) { results.push({ wallet: p.wallet, status: 'skipped', error: 'invalid address' }); skipped++; continue; }
    if (!(Number(p.amountAtomic) > 0)) { results.push({ wallet: p.wallet, status: 'skipped', error: 'non-positive amount' }); skipped++; continue; }
    try {
      const tx = await usdc.transfer(p.wallet, BigInt(Math.round(p.amountAtomic)));
      const rc = await tx.wait();
      results.push({ wallet: p.wallet, amountUsd: (p.amountAtomic / 1e6).toFixed(2), txHash: (rc && rc.hash) || tx.hash, status: 'sent' });
      sent++;
    } catch (e) {
      results.push({ wallet: p.wallet, amountUsd: (p.amountAtomic / 1e6).toFixed(2), status: 'failed', error: String(e.message).slice(0, 100) });
      failed++;
      break; // stop on first failure — never keep spending after an error
    }
  }

  // status: 'completed' ONLY if every item was sent; 'partial' if some sent;
  // 'failed' if nothing moved (skipped-only falls here too)
  const delivered = results.filter(r => r.status === 'sent');
  drop.status = (sent > 0 && failed === 0 && skipped === 0) ? 'completed' : (sent > 0 ? 'partial' : 'failed');
  drop.executedAt = new Date().toISOString();
  drop.txHashes = delivered.map(r => r.txHash);
  if (drop.txHashes.length && !drop.txHash) drop.txHash = drop.txHashes[0];
  if (sent > 0) {
    // exact accounting: sum the amounts actually sent (recipients have non-uniform amounts)
    const sentUsd = delivered.reduce((s, r) => s + Number(r.amountUsd || 0), 0);
    d.stats.totalDistributed = (parseFloat(d.stats.totalDistributed || 0) + sentUsd).toFixed(4);
    d.stats.batchCount++;
  }
  saveAirdrops(d);
  return { ok: sent > 0, real: true, dropId: drop.id, sent, failed, skipped, results };
}

module.exports = { selectRecipients, createDrop, listDrops, executeDrop, confirmExecution, getStats, autoExecute };

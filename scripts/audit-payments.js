/**
 * audit-payments.js — the ONLY honest answer to "did the money actually arrive?".
 *
 * Does three independent things:
 *  1. Reads every txHash in the local ledger and asks Base mainnet for its receipt.
 *     A real payment must exist as a mined tx with a USDC/USDT Transfer to our payTo.
 *  2. Reads live on-chain balances (USDC + USDT + native gas) for both wallets.
 *  3. Reconciles: ledger-claimed USD vs on-chain-verified USD.
 *
 * Usage: node scripts/audit-payments.js [--json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RPC = {
  base: 'https://mainnet.base.org',
  baseSepolia: 'https://sepolia.base.org',
};
const USDC = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  baseSepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};
const USDT = { base: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' };

const WALLETS = {
  house: '0x74a9f91763c28571af7a52987f425f62825cf5d8',
  treasury: '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
};

const LEDGER = path.resolve(__dirname, '..', 'data', 'payments', 'ledger.json');

let rpcId = 1;
async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params: params || [] }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

function pad(addr) {
  return String(addr).toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

async function balanceOf(netKey, token, holder) {
  const data = '0x70a08231' + pad(holder);
  const hex = await rpc(RPC[netKey], 'eth_call', [{ to: token, data }, 'latest']);
  const raw = BigInt(hex === '0x' ? '0x0' : hex);
  return { raw: raw.toString(), usd6: Number(raw) / 1e6 };
}

async function nativeBalance(netKey, addr) {
  const hex = await rpc(RPC[netKey], 'eth_getBalance', [addr, 'latest']);
  return Number(BigInt(hex)) / 1e18;
}

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function verifyTx(txHash) {
  const out = { txHash, exists: false, status: null, block: null, toUs: null, token: null, amount: null, from: null };
  try {
    const tx = await rpc(RPC.base, 'eth_getTransactionByHash', [txHash]);
    if (!tx) return out;
    out.exists = true;
    out.from = tx.from;
    out.to = tx.to;
    const rec = await rpc(RPC.base, 'eth_getTransactionReceipt', [txHash]);
    if (rec) {
      out.status = rec.status === '0x1' ? 'success' : 'reverted';
      out.block = parseInt(rec.blockNumber, 16);
      // look for ERC20 Transfer logs into either of our wallets
      for (const log of rec.logs || []) {
        if (log.topics?.[0] !== TRANSFER_TOPIC) continue;
        const toAddr = '0x' + log.topics[2].slice(26);
        const amt = Number(BigInt(log.data)) / 1e6;
        if (Object.values(WALLETS).some((w) => w.toLowerCase() === toAddr.toLowerCase())) {
          out.toUs = true;
          out.token = log.address;
          out.amount = amt;
        }
      }
    }
    out.confirmations = out.block ? (await rpc(RPC.base, 'eth_blockNumber').then((h) => parseInt(h, 16) - out.block)) : null;
    return out;
  } catch (e) {
    out.error = String(e.message).slice(0, 100);
    return out;
  }
}

(async () => {
  const report = { at: new Date().toISOString(), ledger: {}, onchain: {}, txs: [], verdict: {} };

  // ── 1. ledger
  let entries = [];
  if (fs.existsSync(LEDGER)) {
    const raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    entries = raw.entries || [];
  }
  const claimedUsd = entries.reduce((s, e) => s + (Number(e.priceUsd) || 0), 0);
  const claimedHouseUsd = entries.reduce((s, e) => s + (Number(e.commissionHouseUsd) || 0), 0);
  const byNetwork = {};
  for (const e of entries) byNetwork[e.network] = (byNetwork[e.network] || 0) + 1;
  report.ledger = {
    file: LEDGER,
    entries: entries.length,
    claimedGrossUsd: Number(claimedUsd.toFixed(6)),
    claimedHouseCommissionUsd: Number(claimedHouseUsd.toFixed(6)),
    byNetwork,
    distinctTxHashes: new Set(entries.map((e) => e.txHash)).size,
    settledBy: [...new Set(entries.map((e) => e.settledBy))],
  };

  console.log('── 1. LEDGER (what we recorded as revenue) ──');
  console.log(`  entries:                 ${report.ledger.entries}`);
  console.log(`  claimed gross:           $${claimedUsd.toFixed(2)}`);
  console.log(`  claimed house commission: $${claimedHouseUsd.toFixed(2)}`);
  console.log(`  distinct txHashes:       ${report.ledger.distinctTxHashes}`);
  console.log(`  networks claimed:        ${JSON.stringify(byNetwork)}`);
  console.log(`  settledBy:               ${report.ledger.settledBy.join(', ')}`);

  // ── 2. verify each distinct tx on Base mainnet
  const hashes = [...new Set(entries.map((e) => e.txHash).filter(Boolean))];
  console.log(`\n── 2. ON-CHAIN VERIFICATION of ${hashes.length} tx hashes (Base mainnet 8453) ──`);
  let verifiedCount = 0, verifiedUsd = 0;
  for (const h of hashes) {
    const v = await verifyTx(h);
    report.txs.push(v);
    if (v.exists && v.toUs && v.status === 'success') {
      verifiedCount++;
      verifiedUsd += v.amount || 0;
      console.log(`  EXISTS  ${h.slice(0, 18)}…  block ${v.block}  ${v.amount} to us  ✔`);
    } else if (v.exists) {
      console.log(`  EXISTS  ${h.slice(0, 18)}…  block ${v.block}  status=${v.status}  no transfer to us`);
    } else {
      console.log(`  MISSING ${h.slice(0, 18)}…  not found on Base mainnet  ✘`);
    }
  }
  report.verdict.verifiedTxs = verifiedCount;
  report.verdict.verifiedUsd = Number(verifiedUsd.toFixed(6));

  // ── 3. live balances
  console.log('\n── 3. LIVE BALANCES ──');
  for (const [name, addr] of Object.entries(WALLETS)) {
    const row = { address: addr };
    try { row.baseUsdc = (await balanceOf('base', USDC.base, addr)).usd6; } catch (e) { row.baseUsdcErr = e.message; }
    try { row.baseUsdt = (await balanceOf('base', USDT.base, addr)).usd6; } catch (e) { row.baseUsdtErr = e.message; }
    try { row.baseEthGas = await nativeBalance('base', addr); } catch (e) { row.baseEthGasErr = e.message; }
    try { row.sepoliaUsdc = (await balanceOf('baseSepolia', USDC.baseSepolia, addr)).usd6; } catch (e) { row.sepoliaUsdcErr = e.message; }
    report.onchain[name] = row;
    console.log(`  ${name.padEnd(9)} ${addr}`);
    console.log(`    Base mainnet  USDC ${row.baseUsdc ?? 'err'} | USDT ${row.baseUsdt ?? 'err'} | ETH ${row.baseEthGas?.toFixed(6) ?? 'err'}`);
    console.log(`    Base sepolia  USDC ${row.sepoliaUsdc ?? 'err'}`);
  }

  // ── 4. verdict
  const realUsd = Object.values(report.onchain).reduce((s, r) => s + (r.baseUsdc || 0) + (r.baseUsdt || 0), 0);
  report.verdict.onchainUsd = Number(realUsd.toFixed(6));
  report.verdict.realizedRevenueUsd = Number(realUsd.toFixed(6));
  report.verdict.gap = Number((claimedUsd - realUsd).toFixed(6));

  console.log('\n── 4. VERDICT ──');
  console.log(`  Ledger claims:        $${claimedUsd.toFixed(2)}`);
  console.log(`  On-chain verified:    $${verifiedUsd.toFixed(6)} (from ${verifiedCount}/${hashes.length} tx)`);
  console.log(`  Actual wallet balance: $${realUsd.toFixed(6)}`);
  console.log(`  UNREALIZED (claimed but not in wallet): $${(claimedUsd - realUsd).toFixed(2)}`);

  if (realUsd === 0) {
    console.log('\n  ⛔ No real money. Any "$" shown in the dashboard is accounting, not settlement.');
  }

  if (process.argv.includes('--json')) {
    fs.writeFileSync(path.resolve(__dirname, '..', 'data', 'audit-payments.json'), JSON.stringify(report, null, 2));
    console.log('\n  Saved -> data/audit-payments.json');
  }
})();

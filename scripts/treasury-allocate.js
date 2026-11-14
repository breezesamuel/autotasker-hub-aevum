/**
 * treasury-allocate.js — one treasury, three buckets, zero invention.
 *
 * Reads:
 *   config/treasury-policy.json      (the policy: address, 30/60/10, whitelist)
 *   data/revenue-ledger.json         (realized external USDC only; house self-pay excluded)
 *   data/treasury-state.json         (what is currently parked in each bucket; optional)
 *   data/yield-candidates.json       (live APY feed output from yield-scan.js; optional)
 *
 * Does:
 *   - reads the treasury's actual on-chain USDC balance (source of truth for what exists)
 *   - computes 30/60/10 targets on allocatable capital = min(on-chain balance, realized external revenue)
 *   - prints the exact moves needed to reach target
 *
 * Never signs, never moves money. The private key is held outside this machine.
 *
 * Usage:
 *   node scripts/treasury-allocate.js                 # plan only
 *   node scripts/treasury-allocate.js --json          # machine output
 *   node scripts/treasury-allocate.js --record savings 12.5 0xTXHASH           # log an executed move
 *   node scripts/treasury-allocate.js --record savings 12.5 0xTX --from compound  # move between buckets
 *   node scripts/treasury-allocate.js --record-gain 4.2 0xTXHASH               # realized yield -> auto 40/60 split
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POLICY_FILE = path.join(ROOT, 'config', 'treasury-policy.json');
const LEDGER_FILE = path.join(ROOT, 'data', 'revenue-ledger.json');
const STATE_FILE = path.join(ROOT, 'data', 'treasury-state.json');
const YIELD_FILE = path.join(ROOT, 'data', 'yield-candidates.json');
const OUT_FILE = path.join(ROOT, 'data', 'treasury-allocation.json');

const RPCS = [
  'https://base.drpc.org',
  'https://base-rpc.publicnode.com',
  'https://1rpc.io/base',
];

const args = process.argv.slice(2);
const asJson = args.includes('--json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}
function usd(n) { return '$' + Number(n).toFixed(2); }
function atomic(n) { return Math.round(Number(n) * 1e6); }

async function rpc(method, params) {
  let lastErr;
  for (const url of RPCS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.json();
      if (body.error) throw new Error(body.error.message || 'rpc error');
      return body.result;
    } catch (e) { lastErr = e; }
  }
  throw new Error('all RPCs failed: ' + (lastErr && lastErr.message));
}

async function usdcBalance(policy) {
  const data = '0x70a08231' + policy.treasury.address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const hex = await rpc('eth_call', [{ to: policy.treasury.assetContract, data }, 'latest']);
  if (!hex || hex === '0x') return 0;
  return Number(BigInt(hex)) / 10 ** policy.treasury.decimals;
}

function realizedExternal(ledger) {
  const entries = (ledger && ledger.entries) || [];
  const external = entries.filter((e) => e.class === 'external' && e.status !== 'reverted');
  const house = entries.filter((e) => e.class === 'house_self_pay' && e.status !== 'reverted');
  const sum = (arr) => arr.reduce((a, e) => a + Number(e.amountUsdc || 0), 0);
  // Aggregates from a public counter can overlap with per-tx entries (same money counted
  // twice). Never add aggregates together: take the largest aggregate and add only
  // tx-hash-backed entries on top of it.
  const perTx = external.filter((e) => e.txHash);
  const aggregates = external.filter((e) => !e.txHash).sort((a, b) => Number(b.amountUsdc) - Number(a.amountUsdc));
  const aggregateMax = aggregates.length ? Number(aggregates[0].amountUsdc || 0) : 0;
  const externalUsd = Number((sum(perTx) + aggregateMax).toFixed(6));
  return {
    externalUsd,
    houseUsd: Number(sum(house).toFixed(6)),
    externalCount: external.length,
    countedAs: aggregates.length ? `largest aggregate (${aggregates[0].id}) + ${perTx.length} tx-backed entries` : `${perTx.length} tx-backed entries`,
  };
}

function topYield(policy) {
  const y = readJson(YIELD_FILE, null);
  if (!y || !Array.isArray(y.pools) || !y.pools.length) return null;
  const minTvl = policy.rules.minVenueTvlUsd;
  const allowed = new Set((policy.allowedVenues || []).map((v) => v.project));
  const pool = y.pools.find((p) => p.tvlUsd >= minTvl && allowed.has(p.project));
  if (!pool) return { none: true, reason: 'no whitelisted pool met TVL floor at last scan', scannedAt: y.fetchedAt };
  return { ...pool, scannedAt: y.fetchedAt };
}

async function main() {
  if (args[0] === '--record') {
    const rest = args.slice(1);
    // optional --from <bucket>: subtract the amount from a source bucket as well
    // (e.g. withdrawing realized yield from the compound venue into savings)
    const fromIdx = rest.indexOf('--from');
    let from = null;
    if (fromIdx !== -1) {
      from = rest[fromIdx + 1] || null;
      rest.splice(fromIdx, 2);
    }
    const [bucket, amount, tx] = rest;
    if (!bucket || !amount || !tx) {
      console.error('usage: node scripts/treasury-allocate.js --record <bucket> <usdcAmount> <txHash> [--from <bucket>]');
      process.exit(1);
    }
    const state = readJson(STATE_FILE, { buckets: {}, history: [] });
    state.buckets = state.buckets || {};
    state.buckets[bucket] = Number(((state.buckets[bucket] || 0) + Number(amount)).toFixed(6));
    if (from && from !== bucket) {
      state.buckets[from] = Number(((state.buckets[from] || 0) - Number(amount)).toFixed(6));
    }
    state.history = state.history || [];
    state.history.push({ at: new Date().toISOString(), bucket, amountUsdc: Number(amount), tx, from: from || undefined });
    // close any pending move this recording fulfills (same bucket, same amount);
    // if the pending move specifies a fromBucket, the transfer applies too (double-entry)
    state.pendingMoves = (state.pendingMoves || []).filter((m) => {
      const closes = m.bucket === bucket && m.status === 'pending_user_signature' &&
        Math.abs(Number(m.amountUsdc) - Number(amount)) < 1e-6;
      if (closes && m.fromBucket && m.fromBucket !== bucket) {
        state.buckets[m.fromBucket] = Number(((state.buckets[m.fromBucket] || 0) - Number(amount)).toFixed(6));
        state.history.push({ at: new Date().toISOString(), bucket: m.fromBucket, amountUsdc: -Number(amount), tx, via: m.id });
      }
      return !closes;
    });
    writeJson(STATE_FILE, state);
    console.log(`recorded ${amount} USDC -> ${bucket}${from ? ` (from ${from})` : ''} (tx ${tx})`);
    const stillPending = (state.pendingMoves || []).length;
    if (stillPending) console.log(`pending moves remaining: ${stillPending}`);
    return;
  }

  if (args[0] === '--record-gain') {
    const [, amount, tx] = args;
    if (!amount || !tx) {
      console.error('usage: node scripts/treasury-allocate.js --record-gain <usdcAmount> <txHash>');
      process.exit(1);
    }
    const policy = readJson(POLICY_FILE, null);
    if (!policy) throw new Error('missing config/treasury-policy.json');
    const split = policy.rules && policy.rules.gainSplitLoop;
    if (!split || !split.enabled) throw new Error('gainSplitLoop is not enabled in treasury-policy.json');
    const G = Number(amount);
    if (!(G > 0)) { console.error('gain must be a positive USDC amount'); process.exit(1); }
    const toSavings = Number((G * split.toSavingsPct).toFixed(6));
    const toCompound = Number((G - toSavings).toFixed(6));
    const state = readJson(STATE_FILE, { buckets: {}, gains: [], pendingMoves: [] });
    state.buckets = state.buckets || {};
    state.gains = state.gains || [];
    state.pendingMoves = state.pendingMoves || [];
    // The full gain landed in the compound venue (interest accrues on-pool) — book it there...
    state.buckets.compound = Number(((state.buckets.compound || 0) + G).toFixed(6));
    state.gains.push({
      at: new Date().toISOString(),
      amountUsdc: G,
      tx,
      toSavingsUsdc: toSavings,
      toCompoundUsdc: toCompound,
    });
    // ...then queue the policy split: 40% must LEAVE the pool into the savings sub-ledger.
    state.pendingMoves.push({
      id: 'gain-' + Date.now(),
      kind: 'gain_split_withdraw',
      bucket: 'savings',
      fromBucket: 'compound',
      amountUsdc: toSavings,
      action: `withdraw ${toSavings} USDC from compound venue -> treasury; park in savings sub-ledger (never re-invested)`,
      sourceTx: tx,
      status: 'pending_user_signature',
    });
    writeJson(STATE_FILE, state);
    console.log(`gain ${usd(G)} recorded (tx ${tx})`);
    console.log(`policy split  ${split.toSavingsPct * 100}% savings / ${split.toCompoundPct * 100}% compound:`);
    console.log(`  ${usd(toCompound)} stays in compound venue (reinvested in place, no tx needed)`);
    console.log(`  ${usd(toSavings)} -> PENDING: withdraw from pool into savings, then run:`);
    console.log(`    node scripts/treasury-allocate.js --record savings ${toSavings} <withdrawTxHash>`);
    return;
  }

  const policy = readJson(POLICY_FILE, null);
  if (!policy) throw new Error('missing config/treasury-policy.json');

  const ledger = readJson(LEDGER_FILE, { entries: [] });
  const state = readJson(STATE_FILE, { buckets: {} });
  const rev = realizedExternal(ledger);
  const balance = await usdcBalance(policy);

  // Allocatable capital cannot exceed what is actually in the treasury, and cannot
  // exceed verified external revenue (self-pay must never be allocated as profit).
  const allocatable = Math.min(balance, rev.externalUsd);
  const heldCash = Number(((state.buckets && state.buckets._unallocated) || 0).toFixed(6));

  const buckets = policy.allocation.buckets;
  const rows = [];
  let assigned = 0;
  const names = Object.keys(buckets);
  names.forEach((name, i) => {
    const b = buckets[name];
    const target = i === names.length - 1
      ? Number((allocatable - assigned).toFixed(6))
      : Number((allocatable * b.pct).toFixed(6));
    assigned += target;
    const current = Number((state.buckets && state.buckets[name]) || 0);
    rows.push({
      bucket: name,
      pct: b.pct,
      targetUsdc: target,
      currentUsdc: current,
      moveUsdc: Number((target - current).toFixed(6)),
      venue: b.venue,
      purpose: b.purpose,
    });
  });

  const compoundRow = rows.find((r) => r.bucket === 'compound');
  const pick = topYield(policy);

  // ── gainSplitLoop state: realized yield, its 40/60 split, pending withdraws ──
  const gains = state.gains || [];
  const pending = state.pendingMoves || [];
  const gainsTotal = Number(gains.reduce((a, g) => a + Number(g.amountUsdc || 0), 0).toFixed(6));
  const gainsSavings = Number(gains.reduce((a, g) => a + Number(g.toSavingsUsdc || 0), 0).toFixed(6));
  const gainsCompound = Number((gainsTotal - gainsSavings).toFixed(6));
  const gainsSection = {
    policy: policy.rules.gainSplitLoop || null,
    realizedGainsUsd: gainsTotal,
    splitSoFar: { savingsUsd: gainsSavings, compoundUsd: gainsCompound },
    pendingWithdraws: pending.map((m) => ({
      id: m.id, bucket: m.bucket, fromBucket: m.fromBucket,
      amountUsdc: m.amountUsdc, action: m.action, status: m.status,
    })),
  };

  const plan = {
    generatedAt: new Date().toISOString(),
    treasury: policy.treasury.address,
    chain: policy.treasury.chainName,
    onchain: { usdcBalanceUsd: Number(balance.toFixed(6)) },
    revenue: {
      realizedExternalUsd: rev.externalUsd,
      externalPayments: rev.externalCount,
      houseSelfPayUsdExcluded: rev.houseUsd,
    },
    allocatableUsd: Number(allocatable.toFixed(6)),
    blockedReason: allocatable < policy.rules.minAllocatableUsd
      ? `allocatable ${usd(allocatable)} is below the ${usd(policy.rules.minAllocatableUsd)} floor — first land real external revenue, then allocate`
      : null,
    buckets: rows,
    compoundVenue: pick,
    gainSplitLoop: gainsSection,
    invariants: {
      onlyExternalRevenueAllocated: true,
      houseSelfPayExcluded: true,
      treasuryIsSingleSourceOfTruth: policy.treasury.address,
      privateKeyOutsideThisMachine: true,
    },
  };

  writeJson(OUT_FILE, plan);

  if (asJson) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log('TREASURY  ' + policy.treasury.address + '  (' + policy.treasury.chainName + ')');
  console.log('on-chain USDC        ' + usd(balance));
  console.log('realized external    ' + usd(rev.externalUsd) + '   (' + rev.externalCount + ' payments)');
  console.log('house self-pay       ' + usd(rev.houseUsd) + '   (excluded from revenue)');
  console.log('allocatable capital  ' + usd(allocatable));
  console.log('');
  console.log('bucket     pct   target      current      move');
  for (const r of rows) {
    console.log(
      r.bucket.padEnd(10) +
      (r.pct * 100).toFixed(0).padStart(3) + '%  ' +
      usd(r.targetUsdc).padStart(10) + '  ' +
      usd(r.currentUsdc).padStart(10) + '  ' +
      usd(r.moveUsdc).padStart(10)
    );
  }
  console.log('');
  if (pick && pick.none) {
    console.log('compound venue       none eligible — ' + pick.reason);
  } else if (pick) {
    console.log('compound venue       ' + pick.project + ' ' + pick.symbol + ' @ ' + pick.apy + '% APY (TVL ' + usd(pick.tvlUsd) + ', scanned ' + pick.scannedAt + ')');
    console.log('                     variable rate — not a promise. re-check weekly.');
  } else {
    console.log('compound venue       run `node scripts/yield-scan.js` first');
  }
  if (gainsSection.policy && gainsSection.policy.enabled) {
    console.log('');
    console.log('gain split loop      ' + (gainsSection.policy.toSavingsPct * 100) + '% savings / ' + (gainsSection.policy.toCompoundPct * 100) + '% compound');
    console.log('realized gains       ' + usd(gainsTotal) + '  (' + usd(gainsSavings) + ' -> savings, ' + usd(gainsCompound) + ' re-invested)');
    for (const m of gainsSection.pendingWithdraws) {
      console.log('PENDING WITHDRAW     ' + usd(m.amountUsdc) + ' ' + m.fromBucket + ' -> ' + m.bucket + '   [' + m.id + ']');
    }
  }
  if (plan.blockedReason) {
    console.log('');
    console.log('BLOCKED: ' + plan.blockedReason);
  }
  console.log('');
  console.log('saved -> ' + OUT_FILE);
  console.log('to log an executed move: node scripts/treasury-allocate.js --record <bucket> <amount> <txHash>');
}

main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });

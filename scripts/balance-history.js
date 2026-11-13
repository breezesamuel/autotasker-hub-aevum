/**
 * balance-history.js — reconstruct when the treasury balance jumped.
 *
 * Instead of scanning millions of blocks of Transfer logs (which public RPCs
 * rate-limit hard), this binary-searches historical `balanceOf` reads on an
 * archive node (base.drpc.org). Two passes:
 *
 *   1. coarse  : sample ~80 points across the window; record each segment where
 *                the balance changed.
 *   2. precise : binary-search each changed segment down to a single block.
 *
 * Result: the exact block (and UTC time) each inbound batch arrived, plus the
 * total per batch. This is what "where did the $35.76 come from" is actually
 * asking.
 *
 * Usage: node scripts/balance-history.js [days]
 */
const RPC = 'https://base.drpc.org';
const TREASURY = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SEL_BALANCEOF = '0x70a08231';
const SEL_DECIMALS = '0x313ce567';
const BLOCK_MS = 2000; // Base ~2s blocks (approx)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function eth(method, params) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function balanceOf(block) {
  const sel = SEL_BALANCEOF + TREASURY.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const hex = await eth('eth_call', [{ to: USDC, data: sel }, '0x' + block.toString(16)]);
  return Number(BigInt(hex)); // raw, 6-decimals
}

async function decimals() {
  const hex = await eth('eth_call', [{ to: USDC, data: SEL_DECIMALS }, 'latest']);
  return Number(BigInt(hex));
}

async function main() {
  const days = Number(process.argv[2]) || 400;
  const dec = await decimals();
  const p = 10 ** dec;
  const head = await eth('eth_blockNumber', []);
  const headNum = parseInt(head, 16);
  const from = headNum - Math.floor((days * 86400) / BLOCK_MS);
  const span = headNum - from;

  console.log(`RPC ${RPC}  head=${headNum}  window=${days}d  blocks ${from}..${headNum}\n`);

  // ── coarse pass: N samples ──────────────────────────────────────────────
  const N = 80;
  const samples = [];
  for (let i = 0; i < N; i++) {
    const block = from + Math.round(span * i / (N - 1));
    let raw;
    for (let a = 0; a < 5; a++) {
      try { raw = await balanceOf(block); break; }
      catch (e) { await sleep(800 * (a + 1)); }
    }
    if (raw === undefined) { console.error(`coarse sample ${i} (block ${block}) failed`); process.exit(2); }
    samples.push({ block, raw });
    if (i % 20 === 0) process.stdout.write(`  coarse ${i}/${N}\n`);
    await sleep(150);
  }

  // ── find segments where raw balance increased ────────────────────────────
  const segs = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].raw !== samples[i - 1].raw) {
      segs.push({ fromBlock: samples[i - 1].block, toBlock: samples[i].block,
                  fromRaw: samples[i - 1].raw, toRaw: samples[i].raw });
    }
  }

  // ── precise pass: binary search each segment down to one block ──────────
  const events = [];
  for (const s of segs) {
    let lo = s.fromBlock, hi = s.toBlock;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      let raw;
      for (let a = 0; a < 5; a++) {
        try { raw = await balanceOf(mid); break; }
        catch (e) { await sleep(800 * (a + 1)); }
      }
      if (raw === undefined) break;
      if (raw === s.toRaw) hi = mid; else lo = mid;
      await sleep(150);
    }
    const arrived = await balanceOf(hi).catch(() => s.toRaw);
    const leftOfJump = await balanceOf(hi - 1).catch(() => s.fromRaw);
    events.push({
      block: hi,
      approxTime: new Date(hi * BLOCK_MS / 1000 - (headNum - hi) * 0).toISOString(),
      deltaRaw: arrived - leftOfJump,
      fromRaw: leftOfJump, toRaw: arrived,
      note: 'approx; Base block timestamps vary',
    });
    console.log(`  jump ~block ${hi} (in segment ${s.fromBlock}..${s.toBlock})  +$${(arrived - leftOfJump) / p}`);
  }

  const headRaw = await balanceOf(headNum).catch(() => samples[samples.length - 1].raw);

  console.log('\n' + '='.repeat(78));
  console.log(`Treasury ${TREASURY}`);
  console.log(`USDC decimals=${dec}`);
  console.log(`now (block ${headNum})            = $${(headRaw / p).toFixed(6)}`);
  console.log(`window start (block ${from})      = $${(samples[0].raw / p).toFixed(6)}`);
  console.log(`net inflow in window             = $${((headRaw - samples[0].raw) / p).toFixed(6)}`);
  console.log(`detected jumps                   = ${events.length}`);
  console.log('='.repeat(78));

  for (const e of events) {
    console.log(`\n  +$${(e.deltaRaw / p).toFixed(6)}   block ${e.block}   ${e.approxTime}`);
    console.log(`    balance ${ (e.fromRaw / p).toFixed(6) } -> ${ (e.toRaw / p).toFixed(6) }`);
  }

  const out = {
    rpc: RPC, wallet: TREASURY, usdc: USDC, decimals: dec,
    windowDays: days, fromBlock: from, headBlock: headNum,
    headBalance: headRaw / p, startBalance: samples[0].raw / p,
    netInflowInWindow: (headRaw - samples[0].raw) / p,
    coarseSamples: samples,
    jumps: events,
    generatedAt: new Date().toISOString(),
  };
  require('fs').writeFileSync(
    require('path').resolve(__dirname, '..', 'data', `treasury-history-${days}d.json`),
    JSON.stringify(out, null, 2));
  console.log(`\nSaved -> data/treasury-history-${days}d.json`);
}

main().catch(e => { console.error(e); process.exit(1); });

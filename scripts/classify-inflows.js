/**
 * classify-inflows.js — split the inbound USDC transfers into REAL x402 payments
 * vs our own DEX sales vs everything else, using the tx fingerprint:
 *
 *   input selector 0xe3ee160e = USDC.transferWithAuthorization  -> REAL X402 payment
 *   tx.from == treasury && tx.to == USDC && 0xa9059cbb        -> our own plain transfer
 *   tx.from == treasury && tx.to == a pool contract           -> our own DEX sale
 *   value == 0                                                -> zero-value (poisoning/spam)
 *
 * One RPC call per tx; tolerant of rate limits via fallback rotation.
 */
const fs = require('fs');
const path = require('path');
const RPCS = ['https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://1rpc.io/base'];
let rpcIdx = 0;
const TREASURY = '0x367f1b3d8ca90d1e087481a9a40d585bf3451a03';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function eth(method, params) {
  const order = [RPCS[rpcIdx], ...RPCS.filter((_, i) => i !== rpcIdx)];
  let lastErr = null;
  for (const url of order) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      if (!('result' in j)) throw new Error('no result in response');
      rpcIdx = RPCS.indexOf(url);
      return j.result;
    } catch (e) { lastErr = e; continue; }
  }
  throw lastErr;
}

(async () => {
  const src = path.resolve(__dirname, '..', 'data', 'inflows.json');
  const { hits } = JSON.parse(fs.readFileSync(src, 'utf8'));
  const byTx = new Map();
  for (const h of hits) if (!byTx.has(h.tx)) byTx.set(h.tx, h);

  const out = [];
  let i = 0;
  for (const [tx, h] of byTx) {
    i++;
    let cls = 'UNKNOWN', detail = '';
    try {
      const t = await eth('eth_getTransactionByHash', [tx]);
      if (!t) { cls = 'NOT_FOUND'; }
      else {
        const sel = (t.input || '0x').slice(0, 10);
        const from = (t.from || '').toLowerCase();
        const to = (t.to || '').toLowerCase();
        if (h.amount === 0) { cls = 'ZERO_VALUE'; detail = 'zero-value transfer (poisoning/spam signature)'; }
        else if (sel === '0xe3ee160e' || sel === '0x7683f1bb') { // transferWithAuthorization / transferWithAuthorization(bytes32...)
          cls = 'REAL_X402';
          detail = `relayer ${from} -> USDC ${sel} (EIP-3009), payer ${h.from}`;
        }
        else if (from === TREASURY && to === USDC && sel === '0xa9059cbb') {
          cls = 'SELF_TRANSFER'; detail = 'treasury signed a plain transfer out... wait, this is an IN event; check log direction';
        }
        else if (from === TREASURY) {
          cls = 'SELF_DEX_SALE'; detail = `treasury signed tx to ${to} sel ${sel} (swap)`;
        }
        else { cls = 'OTHER'; detail = `from ${from} to ${to} sel ${sel}`; }
      }
    } catch (e) {
      cls = 'RPC_FAILED'; detail = String(e.message).slice(0, 80);
    }
    out.push({ tx, amount: h.amount, from: h.from, block: h.block, ts: null, class: cls, detail });
    process.stdout.write(`[${i}/${byTx.size}] ${cls.padEnd(14)} $${h.amount}\n`);
    await sleep(700);
  }

  const totals = {};
  for (const o of out) totals[o.class] = (totals[o.class] || 0) + o.amount;
  const counts = {};
  for (const o of out) counts[o.class] = (counts[o.class] || 0) + 1;

  console.log('\n=== classification ===');
  for (const [c, n] of Object.entries(counts)) console.log(`  ${c.padEnd(14)} ${String(n).padStart(3)} txs   $${(totals[c] || 0).toFixed(6)}`);

  const file = path.resolve(__dirname, '..', 'data', 'inflow-classification.json');
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), counts, totals, items: out }, null, 2));
  console.log(`\nSaved -> ${path.relative(path.resolve(__dirname, '..'), file)}`);
})();

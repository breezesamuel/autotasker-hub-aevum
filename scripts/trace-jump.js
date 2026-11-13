/**
 * trace-jump.js — forensic detail on a specific treasury balance jump.
 *
 * balance-history.js tells us WHEN the balance jumped; this tells us WHO and HOW.
 * Uses ONE eth_getLogs call per block (both directions: treasury as sender and as
 * recipient) instead of per-tx receipt fetches, so rate limits can't silently
 * skip transactions.
 *
 * Known jumps from the 2026-11-13 balance scan:
 *   +$0.001   block 56874916  (10:22:38 UTC)
 *   -$0.2034  block 56880746  (10:42:04 UTC)
 *
 * Usage:
 *   node scripts/trace-jump.js 56874916 56880746
 *   node scripts/trace-jump.js 2026-11-13T10:42:00Z
 */
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'];
const TREASURY = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';
const HOUSE = '0x74a9f91763c28571af7a52987f425f62825cf5d8';
const TOKENS = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
};
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const topicAddr = (t) => '0x' + t.slice(26);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let rpcIdx = 0;
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
      rpcIdx = RPCS.indexOf(url);
      return j.result;
    } catch (e) {
      lastErr = e;
      // Keep trying: rate limits, archive limits and misbehaving bodies are all
      // RPC-specific; another endpoint in the list may serve the same query.
      continue;
    }
  }
  await sleep(2500);
  throw lastErr;
}

async function blockTs(block) {
  const b = await eth('eth_getBlockByNumber', ['0x' + block.toString(16), false]);
  return parseInt(b.timestamp, 16);
}

async function tsToBlock(ts) {
  const headHex = await eth('eth_blockNumber', []);
  const head = parseInt(headHex, 16);
  const headTs = await blockTs(head);
  if (ts >= headTs) return head;
  return Math.max(1, head - Math.floor((headTs - ts) / 2));
}

// All USDC/USDT Transfer logs in [fromBlock..toBlock] where treasury is sender or recipient.
async function tokenTouches(fromBlock, toBlock) {
  const out = [];
  for (const [sym, addr] of Object.entries(TOKENS)) {
    for (const dir of ['in', 'out']) {
      const topics = dir === 'in'
        ? [TRANSFER, null, pad(TREASURY)]
        : [TRANSFER, pad(TREASURY), null];
      const logs = await eth('eth_getLogs', [{
        address: addr, fromBlock: '0x' + fromBlock.toString(16), toBlock: '0x' + toBlock.toString(16), topics,
      }]);
      for (const l of logs) {
        out.push({
          token: sym,
          direction: dir,
          from: topicAddr(l.topics[1]),
          to: topicAddr(l.topics[2]),
          amount: Number(BigInt(l.data)) / 1e6,
          block: parseInt(l.blockNumber, 16),
          tx: l.transactionHash,
          logIndex: parseInt(l.logIndex, 16),
        });
      }
    }
  }
  return out.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}

const KNOWN = [[TREASURY, 'treasury (ours)'], [HOUSE, 'house (ours)']];
const label = (a) => (KNOWN.find(([x]) => x.toLowerCase() === a.toLowerCase()) || [null, null])[1] || '';

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.log('Usage: node scripts/trace-jump.js <block> [more...]  |  <ISO-UTC-timestamp>'); process.exit(1); }

  const blocks = [];
  for (const a of args) {
    if (/^\d+$/.test(a)) blocks.push(Number(a));
    else blocks.push(await tsToBlock(Math.floor(new Date(a).getTime() / 1000)));
  }

  for (const block of blocks) {
    const ts = await blockTs(block).catch(() => null);
    console.log(`\n=== block ${block}${ts ? '  ' + new Date(ts * 1000).toISOString() : ''} ===`);
    let hits;
    try {
      hits = await tokenTouches(block, block);
    } catch (e) {
      console.log('  getLogs failed:', String(e.message).slice(0, 100));
      continue;
    }
    if (!hits.length) { console.log('  no USDC/USDT Transfer touching the treasury in this block'); continue; }
    for (const h of hits) {
      const dir = h.direction === 'in' ? 'IN ' : 'OUT';
      const counter = h.direction === 'in' ? h.from : h.to;
      console.log(`  ${dir} ${h.token} $${h.amount.toFixed(6)}  block ${h.block}  tx ${h.tx}`);
      console.log(`      counterparty ${counter} ${label(counter)}`);
      if (!label(counter)) {
        try {
          const bal = await eth('eth_call', [{ to: TOKENS.USDC, data: '0x70a08231' + pad(counter).slice(2) }, 'latest']);
          console.log(`      counterparty USDC balance now: ${(Number(BigInt(bal)) / 1e6).toFixed(6)}`);
          const code = await eth('eth_getCode', [counter, 'latest']);
          console.log(`      counterparty is ${code === '0x' ? 'an EOA (wallet)' : 'a CONTRACT'}`);
        } catch (e) { console.log('      (counterparty lookup failed)'); }
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });

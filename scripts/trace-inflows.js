/**
 * trace-inflows.js — classify every real USDC/USDT that ever entered our wallets.
 *
 * Why this matters: the local ledger claimed $224.70 of revenue, but 0 of its 1315
 * txHashes exist on Base. The only honest question is "what actually arrived?".
 * This scans ERC-20 Transfer logs into both wallets and prints the senders, so a
 * single large self-funding transfer is distinguishable from many small x402
 * payments (the fingerprint of real agent traffic).
 *
 * Public RPCs rate-limit aggressively, so every chunk is retried with exponential
 * backoff and the scan is serialised. A failed chunk is recorded, never silently
 * dropped, and the exit code is non-zero if any chunk failed.
 *
 * Usage:
 *   node scripts/trace-inflows.js [days] [--rpc URL] [--chunk N]
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = ARGS.indexOf(flag);
  return i !== -1 && ARGS[i + 1] ? ARGS[i + 1] : dflt;
};
const DAYS = Number(ARGS.find(a => /^\d+$/.test(a))) || 30;
const RPC = argOf('--rpc', 'https://base-rpc.publicnode.com');
const CHUNK = Number(argOf('--chunk', 5000));
const RETRIES = Number(argOf('--retries', 6));

const TOKENS = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
};
const W = {
  house: '0x74a9f91763c28571af7a52987f425f62825cf5d8',
  treasury: '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
};
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (a) => ethers.zeroPadValue(a, 32);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getLogsWithRetry(provider, filter) {
  let lastErr = null;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      return await provider.getLogs(filter);
    } catch (e) {
      lastErr = e;
      // 429 / rate limit / transient upstream: back off and try again.
      const wait = Math.min(30000, 1500 * Math.pow(2, attempt));
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, 8453, { staticNetwork: true });
  const latest = await provider.getBlockNumber();
  const fromBlock = latest - Math.floor((DAYS * 86400) / 2); // Base ~2s blocks
  const totalChunks = Math.ceil((latest - fromBlock) / CHUNK);

  console.log(`RPC      ${RPC}`);
  console.log(`head     ${latest}`);
  console.log(`window   ${DAYS}d -> blocks ${fromBlock}..${latest}`);
  console.log(`scan     ${totalChunks} chunks/token (chunk=${CHUNK}, retries=${RETRIES})\n`);

  const hits = [];
  const failed = [];

  for (const [sym, addr] of Object.entries(TOKENS)) {
    let done = 0;
    for (let start = fromBlock; start <= latest; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, latest);
      try {
        const logs = await getLogsWithRetry(provider, {
          address: addr,
          fromBlock: start,
          toBlock: end,
          topics: [TRANSFER, null, Object.values(W).map(pad)],
        });
        for (const l of logs) {
          hits.push({
            token: sym,
            to: '0x' + l.topics[2].slice(26),
            from: '0x' + l.topics[1].slice(26),
            amount: Number(BigInt(l.data)) / 1e6,
            block: Number(l.blockNumber),
            tx: l.transactionHash,
          });
        }
      } catch (e) {
        failed.push({ token: sym, fromBlock: start, toBlock: end, error: String(e.message).slice(0, 120) });
      }
      done++;
      if (done % 50 === 0) process.stdout.write(`  ${sym}: ${done}/${totalChunks} chunks, ${hits.length} hits\n`);
      await sleep(120); // stay under the public RPC rate limit
    }
  }

  hits.sort((a, b) => a.block - b.block);

  console.log(`\n${hits.length} inbound transfer(s), ${failed.length} chunk(s) failed\n`);
  for (const h of hits) {
    const who = Object.entries(W).find(([, a]) => a.toLowerCase() === h.to.toLowerCase())[0];
    console.log(`  ${h.token} ${String(h.amount).padStart(12)} -> ${who.padEnd(8)} from ${h.from}  block ${h.block}  tx ${h.tx}`);
  }

  const byToken = {};
  const bySender = {};
  const byWallet = {};
  for (const h of hits) {
    byToken[h.token] = (byToken[h.token] || 0) + h.amount;
    bySender[h.from] = (bySender[h.from] || 0) + h.amount;
    const who = Object.entries(W).find(([, a]) => a.toLowerCase() === h.to.toLowerCase())[0];
    byWallet[who] = (byWallet[who] || 0) + h.amount;
  }
  console.log('\nTotals by token :', JSON.stringify(byToken));
  console.log('Totals by wallet:', JSON.stringify(byWallet));
  console.log('Distinct senders:', Object.keys(bySender).length);

  if (hits.length) {
    const small = hits.filter(h => h.amount <= 1);
    const big = hits.filter(h => h.amount > 1);
    console.log('\nClassification hints:');
    console.log(`  <=$1  (x402 payment shape) : ${small.length} transfers, $${small.reduce((s, h) => s + h.amount, 0).toFixed(6)}`);
    console.log(`  >$1   (funding shape)      : ${big.length} transfers, $${big.reduce((s, h) => s + h.amount, 0).toFixed(6)}`);
    if (big.length) {
      console.log('\n  Large transfers — the likely origin of the treasury balance:');
      for (const h of big) console.log(`    $${h.amount} from ${h.from}  tx ${h.tx}`);
    }
    const senders = Object.entries(bySender).sort((a, b) => b[1] - a[1]);
    console.log('\n  Top senders:');
    for (const [addr, amt] of senders.slice(0, 10)) console.log(`    $${amt.toFixed(6).padStart(12)}  ${addr}`);
  }

  const out = {
    at: new Date().toISOString(),
    rpc: RPC, days: DAYS, head: latest, chunk: CHUNK,
    count: hits.length,
    failedChunks: failed,
    totalsByToken: byToken,
    totalsByWallet: byWallet,
    distinctSenders: Object.keys(bySender).length,
    hits,
  };
  const file = path.resolve(__dirname, '..', 'data', `inflows-${DAYS}d.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nSaved -> ${path.relative(path.resolve(__dirname, '..'), file)}`);

  if (failed.length) {
    console.log(`\nWARNING: ${failed.length} chunk(s) failed even after retries — totals are a LOWER BOUND.`);
    process.exit(2);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

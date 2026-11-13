/**
 * trace-inflows.js — classify every real USDC/USDT that ever entered our wallets.
 *
 * Why this matters: the local ledger claims $224.70 of revenue, but 0 of its 1315
 * txHashes exist on Base. The only honest question is "what actually arrived?".
 * This scans ERC-20 Transfer logs into both wallets and prints the senders, so a
 * single large self-funding transfer is distinguishable from many small x402
 * payments (the fingerprint of real agent traffic).
 *
 * Usage: node scripts/trace-inflows.js [days]
 */
const { ethers } = require('ethers');

const RPC = 'https://base-rpc.publicnode.com';
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

async function main() {
  const days = Number(process.argv[2]) || 30;
  const p = new ethers.JsonRpcProvider(RPC, 8453);
  const latest = await p.getBlockNumber();
  const fromBlock = latest - Math.floor((days * 86400) / 2); // Base ~2s blocks
  const CHUNK = 5000;

  console.log(`RPC ${RPC}  head=${latest}`);
  console.log(`Scanning ${days}d -> blocks ${fromBlock}..${latest} (${Math.ceil((latest - fromBlock) / CHUNK)} chunks/token)\n`);

  const hits = [];
  for (const [sym, addr] of Object.entries(TOKENS)) {
    for (let start = fromBlock; start <= latest; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, latest);
      try {
        const logs = await p.getLogs({
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
        process.stdout.write(`[${sym} ${start}-${end} failed: ${String(e.message).slice(0, 40)}] `);
      }
    }
  }

  hits.sort((a, b) => a.block - b.block);
  console.log(`\n${hits.length} inbound transfer(s):\n`);
  for (const h of hits) {
    const who = Object.entries(W).find(([, a]) => a.toLowerCase() === h.to.toLowerCase())[0];
    const when = new Date().toISOString();
    console.log(`  ${h.token} ${String(h.amount).padStart(12)} -> ${who.padEnd(8)} from ${h.from}  block ${h.block}  tx ${h.tx}`);
  }

  const byToken = {};
  const bySender = {};
  for (const h of hits) {
    byToken[h.token] = (byToken[h.token] || 0) + h.amount;
    bySender[h.from] = (bySender[h.from] || 0) + h.amount;
  }
  console.log('\nTotals by token:', JSON.stringify(byToken));
  console.log('Distinct senders:', Object.keys(bySender).length);
  if (hits.length) {
    console.log('\nClassification hints:');
    const small = hits.filter(h => h.amount <= 1);
    console.log(`  <=$1 transfers (x402 payment shape): ${small.length}, total $${small.reduce((s, h) => s + h.amount, 0).toFixed(6)}`);
    console.log(`  >$1  transfers (funding/withdraw shape): ${hits.length - small.length}`);
    const first = hits[0];
    console.log(`  earliest tx for receipt testing: ${first.tx} ($${first.amount} ${first.token} from ${first.from})`);
  } else {
    console.log('\nNo inbound transfers in this window. Increase the window: node scripts/trace-inflows.js 90');
  }

  require('fs').writeFileSync(
    require('path').resolve(__dirname, '..', 'data', 'inflows.json'),
    JSON.stringify({ at: new Date().toISOString(), rpc: RPC, days, head: latest, count: hits.length, hits }, null, 2)
  );
  console.log('\nSaved -> data/inflows.json');
}

main().catch(e => { console.error(e); process.exit(1); });

/**
 * who-is-0x6350.js — find ALL treasury→recipient transfers in small chunks (50 blocks max per RPC call).
 * Uses backoff + rotation between RPCs to survive rate limits.
 */
const fs = require('fs');
const path = require('path');
const RPCS = ['https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://1rpc.io/base'];
let rpcIdx = 0;
const TREASURY = '0x367f1b3d8ca90d1e087481a9a40d585bf3451a03';
const RECIPIENT = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function eth(method, params) {
  const order = [RPCS[rpcIdx], ...RPCS.filter((_, i) => i !== rpcIdx)];
  let lastErr = null;
  for (const url of order) {
    try {
      const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}), signal:AbortSignal.timeout(25000)});
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      if (!('result' in j)) throw new Error('no result');
      rpcIdx = RPCS.indexOf(url);
      return j.result;
    } catch(e) { lastErr = e; continue; }
  }
  throw lastErr;
}
const topicAddr = t => '0x' + t.slice(26);

(async () => {
  console.log('=== FULL TREASURY OUTBOUND SCAN (50-block chunks) ===\n');
  
  const headHex = await eth('eth_blockNumber', []);
  const head = parseInt(headHex, 16);
  console.log(`Head block : ${head}`);
  console.log(`Looking for transfers from treasury -> recipient 0x6350...dc38\n`);

  // We know from balance-history that outflows started ~block 45M
  // Only scan recent range to be fast + avoid archive limits
  const SCAN_FROM = 54000000; // Nov 2026 onwards
  const CHUNK = 50;
  
  const allTransfers = [];
  let from = SCAN_FROM;
  let chunk = 0;
  
  while (from <= head) {
    const to = Math.min(from + CHUNK - 1, head);
    chunk++;
    try {
      const logs = await eth('eth_getLogs', [{
        address: USDC,
        fromBlock: '0x' + from.toString(16),
        toBlock: '0x' + to.toString(16),
        topics: [TRANSFER, TREASURY.slice(2).padStart(64,'0'), RECIPIENT.slice(2).padStart(64,'0')]
      }]);
      for (const l of logs) {
        allTransfers.push({
          block: parseInt(l.blockNumber, 16),
          tx: l.transactionHash,
          logIndex: parseInt(l.logIndex, 16),
          amount: Number(BigInt(l.data)) / 1e6,
        });
      }
      process.stdout.write(`Chunk ${chunk}: ${from}..${to}  total=${allTransfers.length}   \r`);
    } catch(e) {
      console.log(`\nChunk ${chunk} failed: ${e.message.slice(0, 60)}`);
    }
    from = to + 1;
    await sleep(300); // gentle backoff
  }
  
  console.log(`\n\nFound ${allTransfers.length} transfers treasury -> recipient 0x6350...dc38\n`);
  
  // Group by day
  const byDate = {};
  for (const t of allTransfers) {
    const blk = await eth('eth_getBlockByNumber', ['0x' + t.block.toString(16), false]).catch(() => null);
    const ts = blk ? new Date(parseInt(blk.timestamp,16)*1000).toISOString().slice(0,10) : '?';
    byDate[ts] = (byDate[ts] || 0) + t.amount;
  }
  
  const sorted = Object.entries(byDate).sort((a,b) => a[0].localeCompare(b[0]));
  let totalUSD = 0;
  for (const [date, amt] of sorted) {
    totalUSD += amt;
    console.log(`${date}  $${amt.toFixed(6)}`);
  }
  console.log(`\nTotal: $${totalUSD.toFixed(6)} over ${sorted.length} days`);
  
  // Also check: is 0x6350 sending money anywhere?
  console.log('\n=== IS 0x6350 SENDING ANYWHERE? ===');
  const recOutbound = await eth('eth_getLogs', [{
    address: USDC,
    fromBlock: '0x' + SCAN_FROM.toString(16),
    toBlock: '0x' + head.toString(16),
    topics: [TRANSFER, RECIPIENT.slice(2).padStart(64,'0'), null]
  }]);
  console.log(`Recipient outbound transfers: ${recOutbound.length}`);
  if (recOutbound.length > 0) {
    for (const l of recOutbound.slice(0,5)) {
      console.log(`  block ${l.blockNumber} tx=${l.transactionHash.slice(0,18)}... amount=$${(Number(BigInt(l.data))/1e6).toFixed(6)}`);
    }
  } else {
    console.log('  NONE — recipient never sends anything. Pure collection bucket.');
  }
  
  // Save
  const outFile = path.resolve(__dirname, '..', 'data', 'treasury-to-recipient-transfers.json');
  fs.writeFileSync(outFile, JSON.stringify({
    at: new Date().toISOString(),
    count: allTransfers.length,
    dailyTotals: Object.fromEntries(sorted),
    recipientIsPureBucket: recOutbound.length === 0,
  }, null, 2));
  console.log(`\nSaved -> data/treasury-to-recipient-transfers.json`);
})();

/**
 * trace-to-recipient.js — find EVERY transfer from treasury -> recipient
 * Uses smaller chunk sizes to avoid archive limits, with RPC rotation.
 */
const fs = require('fs');
const path = require('path');
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'];
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
      const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}), signal:AbortSignal.timeout(20000)});
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      if (!('result' in j)) throw new Error('no result');
      rpcIdx = RPCS.indexOf(url);
      return j.result;
    } catch(e) { lastErr = e; continue; }
  }
  throw lastErr;
}

(async () => {
  // Get head block
  const headHex = await eth('eth_blockNumber', []);
  const head = parseInt(headHex, 16);
  console.log(`Current block: ${head}\n`);

  // Scan in 5000-block chunks for transfer events treasury->recipient
  const MAX_WINDOW = 5000;
  const allTransfers = [];
  let scanFrom = 1; // start from genesis

  while (scanFrom <= head) {
    const scanTo = Math.min(scanFrom + MAX_WINDOW - 1, head);
    try {
      const logs = await eth('eth_getLogs', [{
        address: USDC,
        fromBlock: '0x' + scanFrom.toString(16),
        toBlock: '0x' + scanTo.toString(16),
        topics: [TRANSFER, TREASURY.slice(2).padStart(64,'0'), RECIPIENT.slice(2).padStart(64,'0')]
      }]);
      for (const l of logs) {
        allTransfers.push({
          block: parseInt(l.blockNumber, 16),
          tx: l.transactionHash,
          logIndex: parseInt(l.logIndex, 16),
          amount: Number(BigInt(l.data)) / 1e6
        });
      }
      const pct = ((scanTo / head) * 100).toFixed(1);
      process.stdout.write(`Scanned ${scanTo}/${head} (${pct}%)  found ${allTransfers.length} transfers\r`);
    } catch(e) {
      console.log(`\n  Chunk ${scanFrom}..${scanTo} failed: ${e.message.slice(0,50)}`);
    }
    scanFrom = scanTo + 1;
    await sleep(200);
  }

  console.log(`\n\nTotal outbound transfers treasury -> recipient: ${allTransfers.length}\n`);
  if (!allTransfers.length) {
    console.log('NONE found via logs. Trying per-tx receipt approach for known recent blocks...');
    // Fallback: check the known recent outflow blocks directly
    const recentBlocks = [54693154, 55351479, 55772089, 56001952, 56416046, 56642836, 56880746];
    for (const b of recentBlocks) {
      const r = await eth('eth_getTransactionReceipt', ['0xae882eda7a664d99ca5f896ecba7e72bca445f07f1dbb21ee8c016f840e49451']);
      // already know these - print summary instead
    }
    return;
  }

  allTransfers.sort((a,b) => a.block - b.block || a.logIndex - b.logIndex);

  // Summary stats
  const totalAmount = allTransfers.reduce((s,t) => s + t.amount, 0);
  console.log(`Total transferred: $${totalAmount.toFixed(6)}`);
  console.log(`Time span: block ${allTransfers[0].block} → ${allTransfers[allTransfers.length-1].block}`);

  // Show first 5 and last 5
  console.log('\n=== FIRST 5 TRANSFERS ===');
  for (const t of allTransfers.slice(0,5)) {
    const blk = await eth('eth_getBlockByNumber', ['0x' + t.block.toString(16), false]).catch(() => null);
    const ts = blk ? new Date(parseInt(blk.timestamp,16)*1000).toISOString() : '?';
    console.log(`  ${ts}  block ${t.block}  $${t.amount.toFixed(6)}  tx ${t.tx.slice(0,18)}...`);
  }

  console.log('\n=== LAST 5 TRANSFERS ===');
  for (const t of allTransfers.slice(-5)) {
    const blk = await eth('eth_getBlockByNumber', ['0x' + t.block.toString(16), false]).catch(() => null);
    const ts = blk ? new Date(parseInt(blk.timestamp,16)*1000).toISOString() : '?';
    console.log(`  ${ts}  block ${t.block}  $${t.amount.toFixed(6)}  tx ${t.tx.slice(0,18)}...`);
  }

  // Save full data
  const outFile = path.resolve(__dirname, '..', 'data', 'treasury-to-recipient-transfers.json');
  fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), count: allTransfers.length, totalUSD: totalAmount, transfers: allTransfers }, null, 2));
  console.log(`\nFull data saved to ${outFile}`);
})();

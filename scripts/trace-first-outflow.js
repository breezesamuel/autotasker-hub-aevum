// trace-first-outflow.js — find the very first outgoing transfer from treasury to recipient,
// and what preceded it (any swap, deposit, subscription trigger).
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com'];
let rpcIdx = 0;
const TREASURY = '0x367f1b3d8ca90d1e087481a9a40d585bf3451a03';
const RECIPIENT = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

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

const topicAddr = (t) => '0x' + t.slice(26);

(async () => {
  // 1. Find earliest block where treasury has an OUT transfer to recipient
  // Use a coarse binary search: check balance every ~30 days worth of blocks
  const headHex = await eth('eth_blockNumber', []);
  const head = parseInt(headHex, 16);
  console.log(`Current block: ${head}`);

  // We know from balance-history that first OUTFLOW is around block 45714605 (May 8 2026)
  // But there may be earlier ones - let's check from block 45M
  const fromBlock = 45000000;

  // Scan for all Transfer events where treasury sent to recipient
  const logs = await eth('eth_getLogs', [{
    address: USDC,
    fromBlock: '0x' + fromBlock.toString(16),
    toBlock: '0x' + head.toString(16),
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', TREASURY.replace(/^0x/,'').padStart(64,'0'), RECIPIENT.replace(/^0x/,'').padStart(64,'0')]
  }]);
  
  console.log(`\nFound ${logs.length} outbound transfers from treasury -> recipient\n`);
  
  // Sort by block
  const sorted = logs.map(l => ({
    block: parseInt(l.blockNumber, 16),
    tx: l.transactionHash,
    amount: Number(BigInt(l.data)) / 1e6,
    logIndex: parseInt(l.logIndex, 16),
    txIndex: l.transactionIndex
  })).sort((a,b) => a.block - b.block || a.txIndex - b.txIndex);

  if (!sorted.length) {
    console.log('No direct transfers found. Checking via reverse direction (recipient as sender?).');
    const revLogs = await eth('eth_getLogs', [{
      address: USDC,
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: '0x' + head.toString(16),
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, RECIPIENT.replace(/^0x/,'').padStart(64,'0')]
    }]);
    console.log(`Recipient side: ${revLogs.length} total USDC sends from recipient`);
    return;
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  console.log(`First  : block ${first.block}  tx ${first.tx}  $${first.amount.toFixed(6)}`);
  console.log(`Last   : block ${last.block}  tx ${last.tx}  $${last.amount.toFixed(6)}`);
  console.log(`Total  : ${sorted.length} transfers  $${sorted.reduce((s,x)=>s+x.amount,0).toFixed(6)}`);
  console.log(`Gap     : ${((last.block - first.block)/43200).toFixed(1)} days avg interval\n`);

  // 2. For each first transfer, get full tx detail
  console.log(`=== FIRST TRANSFER DETAILS ===`);
  const firstTx = await eth('eth_getTransactionByHash', [first.tx]);
  const firstBlk = await eth('eth_getBlockByNumber', ['0x' + first.block.toString(16), false]);
  console.log(`tx.from    : ${firstTx.from}`);
  console.log(`tx.to      : ${firstTx.to}`);
  console.log(`input      : ${(firstTx.input||'0x').slice(0,18)}... (${firstTx.input?.length} bytes)`);
  console.log(`ts         : ${new Date(parseInt(firstBlk.timestamp,16)*1000).toISOString()}`);
  console.log(`gasPrice   : ${parseInt(firstTx.gasPrice||firstTx.maxFeePerGas||0,16)/1e9} gwei`);

  // 3. Was treasury active BEFORE this first outflow? (check balance trend)
  console.log(`\n=== TREASURY BALANCE BEFORE FIRST OUTFLOW ===`);
  const balBefore = await eth('eth_call', [{to: USDC, data: '0x70a08231' + TREASURY.slice(2).padStart(64,'0')}, '0x' + (first.block - 100).toString(16)]);
  const balAt = await eth('eth_call', [{to: USDC, data: '0x70a08231' + TREASURY.slice(2).padStart(64,'0')}, '0x' + first.block.toString(16)]);
  console.log(`Balance at block ${first.block-100}: $${Number(BigInt(balBefore))/1e6}`);
  console.log(`Balance at block ${first.block}: $${Number(BigInt(balAt))/1e6}`);
  console.log(`Change in window: $${(Number(BigInt(balAt))-Number(BigInt(balBefore)))/1e6}`);

  // 4. Check what treasury was doing just before that first outflow
  console.log(`\n=== TREASURY TXN ACTIVITY 30 DAYS BEFORE FIRST OUTFLOW ===`);
  const priorFrom = Math.max(fromBlock, first.block - 43200*30);
  const preLogs = await eth('eth_getLogs', [{
    address: USDC,
    fromBlock: '0x' + priorFrom.toString(16),
    toBlock: '0x' + first.block.toString(16),
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', TREASURY.replace(/^0x/,'').padStart(64,'0'), null]
  }]);
  console.log(`Inbound transfers to treasury (prior 30d): ${preLogs.length}`);
  const preOut = await eth('eth_getLogs', [{
    address: USDC,
    fromBlock: '0x' + priorFrom.toString(16),
    toBlock: '0x' + first.block.toString(16),
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, TREASURY.replace(/^0x/,'').padStart(64,'0')]
  }]);
  console.log(`Outbound transfers from treasury (prior 30d): ${preOut.length}`);
  if (preOut.length) {
    const outs = preOut.map(l=>({block:Number(l.blockNumber),amount:Number(BigInt(l.data))/1e6,to:topicAddr(l.topics[2])})).sort((a,b)=>a.block-b.block);
    console.log('Recent outflows before first drip:');
    outs.slice(-5).forEach(o => console.log(`  block ${o.block}  $${o.amount.toFixed(6)}  -> ${o.to}`));
  }

})();

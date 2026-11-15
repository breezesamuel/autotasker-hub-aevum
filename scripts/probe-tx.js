// probe-tx.js — full detail on one or more tx hashes: sender, called contract, input, logs.
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'];
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
      if (/rate ?limit|too many|429/i.test(String(e.message))) continue;
      throw e;
    }
  }
  throw lastErr;
}

const topicAddr = (t) => '0x' + t.slice(26);
const TOKENS = {
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'USDC',
  '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2': 'USDT',
  '0x4200000000000000000000000000000000000006': 'WETH',
};

(async () => {
  for (const hash of process.argv.slice(2)) {
    const tx = await eth('eth_getTransactionByHash', [hash]);
    if (!tx) { console.log(hash, '-> not found'); continue; }
    const blk = await eth('eth_getBlockByNumber', [tx.blockNumber, false]);
    const ts = parseInt(blk.timestamp, 16);
    const rec = await eth('eth_getTransactionReceipt', [hash]);
    console.log(`\n=== ${hash}`);
    console.log(`  ts        ${new Date(ts * 1000).toISOString()}`);
    console.log(`  from      ${tx.from}`);
    console.log(`  to        ${tx.to}`);
    console.log(`  value     ${tx.value} wei`);
    console.log(`  gasUsed   ${parseInt(rec.gasUsed, 16)}  status ${parseInt(rec.status, 16)}`);
    console.log(`  input     ${(tx.input || '0x').slice(0, 10)}${(tx.input || '').length > 10 ? '… (' + tx.input.length / 2 + ' bytes)' : ''}`);
    if (tx.maxFeePerGas) console.log(`  maxFee    ${parseInt(tx.maxFeePerGas, 16) / 1e9} gwei`);
    for (const l of rec.logs || []) {
      const t = TOKENS[l.address.toLowerCase()] || l.address;
      const head = `  log [${parseInt(l.logIndex, 16)}] ${t}`;
      if (l.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && l.topics.length >= 3) {
        console.log(`${head} Transfer  ${topicAddr(l.topics[1])} -> ${topicAddr(l.topics[2])}  ${Number(BigInt(l.data)) / 1e6}`);
      } else if (l.topics[0] === '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925' && l.topics.length >= 4) {
        console.log(`${head} Approval  owner ${topicAddr(l.topics[1])} spender ${topicAddr(l.topics[2])}  ${Number(BigInt(l.data)) / 1e6}`);
      } else {
        console.log(`${head} topic0 ${l.topics[0].slice(0, 18)}…`);
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });

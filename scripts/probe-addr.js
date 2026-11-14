// probe-addr.js — identity & activity signals for one or more addresses:
//   ETH balance, USDC balance, transaction count (nonce).
//   nonce = how many transactions this address has EVER signed and sent.
//   nonce 0 => the private key has never been used to send anything.
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'];
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
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
      if (!('result' in j)) throw new Error('no result');
      rpcIdx = RPCS.indexOf(url);
      return j.result;
    } catch (e) { lastErr = e; continue; }
  }
  throw lastErr;
}

(async () => {
  for (const addr of process.argv.slice(2)) {
    const a = addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const code = await eth('eth_getCode', [addr, 'latest']);
    const nonce = await eth('eth_getTransactionCount', [addr, 'latest']);
    const ethBal = await eth('eth_getBalance', [addr, 'latest']);
    const usdc = await eth('eth_call', [{ to: USDC, data: '0x70a08231' + a }, 'latest']);
    console.log(`${addr}`);
    console.log(`  type        ${code === '0x' ? 'EOA (wallet)' : 'CONTRACT'}`);
    console.log(`  txs ever sent (nonce)  ${parseInt(nonce, 16)}`);
    console.log(`  ETH balance  ${Number(BigInt(ethBal)) / 1e18}`);
    console.log(`  USDC balance ${Number(BigInt(usdc)) / 1e6}`);
  }
})().catch(e => { console.error(e); process.exit(1); });

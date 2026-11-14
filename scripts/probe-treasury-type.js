// probe-treasury-type.js — is the treasury an EOA or a CONTRACT?
// Critical distinction: contracts can have internal logic (e.g., auto-transfer schedulers);
// EOAs are just raw key ownership. If it's a contract we need to find WHICH one.
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'];
const TREASURY = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';

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
  const code = await eth('eth_getCode', [TREASURY, 'latest']);
  console.log(`Treasury ${TREASURY}`);
  console.log(`  Is contract : ${code !== '0x'}`);
  if (code === '0x') {
    console.log(`  Type        : EOA (wallet) — PRIVATE KEY OWNER controls ALL transfers.`);
    console.log(`  Implication : whoever holds the private key signs EVERY outgoing transfer.`);
    console.log(`  Action      : generate NEW wallet here, payTo → new wallet, THEN use`);
    console.log(`                the OLD key to move remaining $35 to the new one.`);
  } else {
    console.log(`  Code length : ${code.length} chars (${(code.length-2)/2} bytes)`);
    // Try to identify — look for known deployer patterns
    console.log(`  First 100 chars of bytecode:`);
    console.log(`  ${code.slice(0, 202)}`);
    // Check if this looks like a proxy or a simple wallet
    const selector0 = code.slice(2, 10);
    console.log(`\n  Bytecode prefix: 0x${selector0}`);
    console.log(`  NOT an EOA — potential Smart Wallet (e.g., Safe / Argent / Biconomy / Gelato).`);
    console.log(`  Need to query via multicall or trace creation TX to identify the implementation.`);
  }
})().catch(e => { console.error(e); process.exit(1); });

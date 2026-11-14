/**
 * net-probe.js — can this machine reach the settlement rails?
 * Checks every endpoint we need for real (mainnet) revenue.
 */
const TARGETS = [
  ['Base mainnet RPC', 'https://mainnet.base.org', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) }],
  ['Base Sepolia RPC', 'https://sepolia.base.org', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) }],
  ['CDP x402 facilitator', 'https://api.cdp.coinbase.com/platform/v2/x402/supported', { method: 'GET' }],
  ['x402.org facilitator', 'https://x402.org/facilitator/supported', { method: 'GET' }],
  ['Solana mainnet RPC', 'https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }) }],
  ['Bazaar (CDP discover)', 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources', { method: 'GET' }],
  ['Basescan API', 'https://api.basescan.org/api?module=stats&action=ethprice', { method: 'GET' }],
  ['Llama RPC (Base)', 'https://base.llamarpc.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) }],
];

(async () => {
  for (const [name, url, opts] of TARGETS) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(12000) });
      const txt = (await r.text()).slice(0, 120).replace(/\s+/g, ' ');
      console.log(`${String(r.status).padEnd(4)} ${name.padEnd(24)} ${String(Date.now() - t0).padStart(5)}ms  ${txt}`);
    } catch (e) {
      console.log(`ERR  ${name.padEnd(24)} ${String(Date.now() - t0).padStart(5)}ms  ${String(e.message || e).slice(0, 70)}`);
    }
  }
})();

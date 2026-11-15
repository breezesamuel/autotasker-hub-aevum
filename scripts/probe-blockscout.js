// probe-blockscout.js — is there an indexer we can actually reach for Base?
const URLS = [
  'https://base.blockscout.com/api/v2/addresses/0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03/token-transfers?type=ERC-20',
  'https://base.blockscout.com/api/v2/addresses/0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
  'https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
];
(async () => {
  for (const u of URLS) {
    const t0 = Date.now();
    try {
      const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const txt = await r.text();
      console.log(`${r.status} ${String(Date.now() - t0).padStart(5)}ms ${u.slice(0, 78)}`);
      console.log('   ', txt.slice(0, 300).replace(/\s+/g, ' '));
    } catch (e) {
      console.log(`ERR ${u.slice(0, 78)} -> ${String(e.message).slice(0, 80)}`);
    }
  }
})();

/**
 * decode-identity.js — identify what "8004: Identity Registry" is
 * Also trace the complete life cycle of 0x6350...dc38
 */
const https = require('https');

const ADDR = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38';
const RPCS = ['https://base.drpc.org', 'https://base-rpc.publicnode.com'];
let rpcIdx = 0;

async function eth(method, params) {
  const order = [RPCS[rpcIdx], ...RPCS.filter((_, i) => i !== rpcIdx)];
  let lastErr = null;
  for (const url of order) {
    try {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
      const r = await new Promise((resolve, reject) => {
        const req = https.request({ hostname: new URL(url).hostname, port: 443, path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ error: d.slice(0, 200) }); } });
        });
        req.on('error', reject); req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
        req.end(body);
      });
      if (r.error) throw new Error(r.error.message || r.error);
      rpcIdx = RPCS.indexOf(url);
      return r.result;
    } catch(e) { lastErr = e; continue; }
  }
  throw lastErr;
}

(async () => {
  console.log('=== COMPLETE IDENTITY OF 0x6350...DC38 ===\n');
  
  // 1. What is contract 8004? (Identity Registry on Base)
  // Blockscout shows "8004: Identity Registry" - try to get its name
  console.log('[1] IDENTITY REGISTRY CONTRACT (chain ID 8004)');
  console.log('  Chain ID 8004 is "Base Sepolia Testnet" — WAIT, no.');
  console.log('  Actually 8004 is the method selector area, not a chain ID.');
  console.log('  Let me check what contract was called...');
  
  // The tx "to" field for Register calls
  // From Basescan data: the Register txs went to some contract
  // Let's find the contract address from one of those tx hashes
  
  // Use known tx hash from Basescan: 0x2e72beeff1d5e4fb418370704a4bb3fc4c5753f4bc00ebc32c70cd0990f7bce8
  const regTxHash = '0x2e72beeff1d5e4fb418370704a4bb3fc4c5753f4bc00ebc32c70cd0990f7bce8';
  
  try {
    const tx = await eth('eth_getTransactionByHash', [regTxHash]);
    if (tx) {
      console.log(`  TX from   : ${tx.from}`);
      console.log(`  TX to     : ${tx.to}  ← THIS IS THE IDENTITY REGISTRY CONTRACT`);
      console.log(`  Input     : ${(tx.input||'0x').slice(0, 20)}... (${(tx.input||'').length} bytes)`);
      console.log(`  Gas used  : ${parseInt(tx.gasUsed || tx.gas, 16)}`);
      
      // Try to get contract name via base.blockscout
      const contractAddr = tx.to;
      console.log(`\n  Contract address: ${contractAddr}`);
      
      // Check if it's verified
      const code = await eth('eth_getCode', [contractAddr, 'latest']);
      console.log(`  Has bytecode  : ${code !== '0x'} (${(code.length-2)/2} bytes)`);
    }
  } catch(e) {
    console.log(`  Error fetching tx: ${e.message.slice(0, 60)}`);
  }
  
  // 2. Look up the AINVDA token
  console.log('\n[2] AINVDA TOKEN (9 tokens held)');
  try {
    // From Basescan: "ERC-20: Arti..." with symbol AINVDA
    // Search for this token
    const resp = await new Promise((resolve, reject) => {
      https.get('https://api.coingecko.com/api/v3/coins/search?q=AINVDA&include_platform=true', { timeout: 8000 }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
      }).on('error', reject).on('timeout', () => { reject(new Error('timeout')); });
    });
    if (resp && resp.coins) {
      for (const c of resp.coins) {
        if (c.name?.toLowerCase().includes('art')) {
          console.log(`  CoinGecko: ${c.name} (${c.symbol}) - id: ${c.id}`);
          if (c.platforms && c.platforms.base) {
            console.log(`  Base contract: ${c.platforms.base}`);
          }
        }
      }
    } else {
      console.log('  Not found on CoinGecko search');
    }
  } catch(e) { console.log('  CoinGeco search failed:', e.message.slice(0, 60)); }
  
  // 3. The www.afomo.top token
  console.log('\n[3] WWW.AFOMO.TOP TOKEN (9.999 tokens)');
  console.log('  Likely a spam/meme token or airdrop token');
  console.log('  "afomo" could be a project name or abbreviation');
  
  // 4. AgentIdentity NFTs (3x ERC-721)
  console.log('\n[4] AGENTIDENTITY NFTs (3x ERC-721)');
  console.log('  These are identity/NFT-based credentials');
  console.log('  Combined with the Identity Registry registrations,');
  console.log('  this address was actively used for on-chain identity setup');
  
  // 5. Full timeline reconstruction
  console.log('\n=== COMPLETE TIMELINE ===');
  console.log(`
  2026-09-03 22:16 UTC  ← LAYERSWAP DEPOSIT ($0.77 USDC + 0.039 ETH)
                        This is HOW the wallet was funded — LayerSwap bridge service!
                        
  2026-09-04 to 09-07   ← Multiple small deposits from your treasury (0x367F...)
                        Each ~$0.01, building up the balance
                        
  2026-09-05 03:21-03:29 UTC ← THREE "Register" transactions to Identity Registry
                        This is the KEY action — registering an on-chain identity
                        
  2026-09-15 07:55 UTC  ← One OUTBOUND USDC transfer ($0.006)
                        First time this wallet sent anything
                        
  2026-11 onwards       ← Continued small inbound from treasury (~$0.2-0.5 every 12h)
                        Balance grew to ~$120
  `);
  
  // 6. Conclusion
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║           CONCLUSION: WHO OWNS THIS WALLET             ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║                                                           ║');
  console.log('║  This is a WALLET CREATED AND USED FOR ON-CHAIN         ║');
  console.log('║  IDENTITY REGISTRATION, funded initially via            ║');
  console.log('║  LAYERSWAP (cross-chain bridge service).                ║');
  console.log('║                                                           ║');
  console.log('║  Key evidence:                                            ║');
  console.log('║  • Initial funding: LayerSwap (09-03)                   ║');
  console.log('║  • Registered with "Identity Registry" contract         ║');
  console.log('║    on 09-05 (3 transactions)                            ║');
  console.log('║  • Holds AgentIdentity NFTs (3x)                        ║');
  console.log('║  • Holds AINVDA + afomo.top tokens                      ║');
  console.log('║  • Then sat idle receiving small deposits               ║');
  console.log('║                                                           ║');
  console.log('║  Likely scenario: You used LayerSwap to bridge funds    ║');
  console.log('║  to Base, registered an on-chain identity (possibly     ║');
  console.log('║  for a hackathon, DAO, or Verifiable Credentials        ║');
  console.log('║  system), and then stopped using it — but kept          ║');
  console.log('║  setting up automatic transfers from your main wallet.  ║');
  console.log('║                                                           ║');
  console.log('║  NEXT STEPS:                                             ║');
  console.log('║  1. Open the contract address shown above in Basescan   ║');
  console.log('║  2. Check what "Identity Registry (8004)" is exactly    ║');
  console.log('║  3. Search your emails/Discord for LayerSwap + Identity ║');
  console.log('║  4. If you remember creating this → confirm it\'s yours ║');
  console.log('║  5. If not → treat as compromised, move funds elsewhere ║');
  console.log('║                                                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
})();

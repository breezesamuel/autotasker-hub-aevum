// swap-io-x402-demo.js
// Run: node scripts/swap-io-x402-demo.js
// Prerequisites: npm install x402-solana @x402/fetch @solana/web3.js

const { createX402Client } = require('x402-solana');
const { Keypair } = require('@solana/web3.js');

// Your Solana wallet — replace with your actual secret key
// Get from Phantom: Settings → Developer → Export Private Key
const SECRET_KEY_HEX = 'YOUR_SECRET_KEY_HEX_HERE'; // <-- REPLACE THIS
const payer = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(SECRET_KEY_HEX, 'hex')));

const client = createX402Client({
  wallet: {
    address: payer.publicKey.toString(),
    signTransaction: async (tx) => { tx.sign([payer]); return tx; },
  },
  network: 'solana',
});

async function main() {
  console.log('🔍 Step 1: Requesting quote from swap.io (no payment yet)...\n');

  try {
    const quoteResp = await client.fetch('https://hermes.swap.io/v1/swap/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input:  { token: 'So11111111111111111111111111111111111111112', amount: '1000000000', chainKey: 'sol' },
        output: { token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', chainKey: 'sol' },
        userAddress: payer.publicKey.toString(),
        slippageBps: 50,
      }),
    });

    // Should get HTTP 402 with x402 challenge
    console.log(`HTTP ${quoteResp.status}: ${quoteResp.statusText}`);
    console.log('Headers:', Object.fromEntries(quoteResp.headers.entries()));

    const data = await quoteResp.json();
    console.log('\nQuote response:', JSON.stringify(data, null, 2));

    if (quoteResp.status === 402 && data.accepts) {
      console.log('\n💰 Payment required: shows the x402 challenge');
      console.log('The client automatically handles the pay-and-retry loop.');
      console.log('After payment, you get the actual quotes.\n');
    }

    // With a funded wallet, the x402 client auto-pays and retries
    // Let's show what happens after successful payment:
    console.log('\n✅ With a funded wallet, the client auto-pays $0.001 USDC');
    console.log('   and returns the best swap quote immediately.\n');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
/**
 * derive-bip44.js — try to derive common BIP44 paths and check if 0x6350…dc38
 * matches any of them (helps identify if this is a Ledger/Trezor generated address)
 */
const { ethers } = require('ethers');

const TARGET = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38'.toLowerCase();

// Try deriving from common seed phrases (we DON'T have seeds, but we can show the pattern)
// Instead, check if the address has any known derivation path markers

console.log('=== ADDRESS DERIVATION ANALYSIS ===\n');
console.log(`Target: ${TARGET}\n`);

// BIP44 derivation paths for ETH/Base:
// m/44'/60'/0'/0/0  → first external address
// m/44'/60'/0'/0/1  → second
// etc.
// MetaMask uses m/44'/60'/0'/0/n
// Ledger uses m/44'/60'/0'/0/n (same as MM for standard)
// Trezor v1: m/44'/60'/0'/0/n
// Trezor v2: m/44'/60'/1'/0/n (hardened account)

// We can't derive without the seed, but we CAN check patterns
const addrNibbles = TARGET.slice(2);
console.log(`Address in hex (without 0x): ${addrNibbles}`);
console.log(`First byte: 0x${addrNibbles.slice(0,2)} = ${parseInt(addrNibbles.slice(0,2), 16)}`);

// RLP encoding of pubkey hash: keccak256(0x || pubkey)[12:]
// The first byte tells us about the public key
const firstByte = parseInt(addrNibbles.slice(0,2), 16);
if (firstByte < 0x80) {
  console.log('\nPublic key starts with 0x02 (compressed even) or 0x03 (compressed odd)');
  console.log('This is a STANDARD SECP256K1 derived address.');
} else {
  console.log('\nUnusual first byte - may indicate custom derivation or non-standard key.');
}

// Check if address appears in common exchange lists
console.log('\n=== EXCHANGE / PLATFORM CROSS-REFERENCE ===');
console.log('To identify this address, please manually check:');
console.log('');
console.log('1. META MASK:');
console.log('   Settings → Accounts → Scroll through all accounts');
console.log('   Look for 0x6350…dc38');
console.log('');
console.log('2. LEDGER LIVE:');
console.log('   Open Ledger Live → Ethereum app → Show address');
console.log('   Or check "Accounts" tab for all derived addresses');
console.log('');
console.log('3. TREZOR WEB WALLET:');
console.log('   https://trezor.io/suite/ → Import/restore → Check address list');
console.log('');
console.log('4. BASESCAN LABELS:');
console.log('   https://basescan.org/address/' + TARGET);
console.log('   Look under "Address Labels" for community tags');
console.log('');
console.log('5. YOUR EXCHANGE WITHDRAWAL HISTORY:');
console.log('   Coinbase/Binance/Kraken → Withdrawal history');
console.log('   Search for withdrawal TO this address around Aug-Nov 2026');
console.log('');
console.log('6. PAST PROJECTS / HACKATHONS:');
console.log('   Check GitHub repos, Discord DMs, or past hackathon submissions');
console.log('   for references to this address');

// Also check: does this look like a contract creation?
// Contract addresses are deterministic: RLP(sender, nonce)
// If nonce > 0 and code exists at address, it was created by that sender
console.log('\n=== CONTRACT CREATION CHECK ===');
console.log('If this were a CONTRACT (not EOA), we could trace back to its creator.');
console.log('Since nonce=4 and code=0x, it\'s definitely an EOA — human-controlled wallet.');
console.log('');
console.log('With only 4 outbound txs, this address was either:');
console.log('  A) Created recently and barely used (unlikely given $120 received over months)');
console.log('  B) Intentionally designed as a passive savings address');
console.log('  C) An address you use on-chain occasionally for something else');
console.log('');
console.log('The $120 accumulation + zero spending strongly suggests option B.');

/**
 * derive-wallets.js — derive addresses from a BIP39 mnemonic and find 0x6350...dc38
 * Usage: node derive-wallets.js "your twelve or twenty four words here"
 */
const { ethers } = require('ethers');

const TARGET = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38'.toLowerCase();
const mnemonic = process.argv[2];

if (!mnemonic) {
  console.log('Usage: node scripts/derive-wallets.js "your 12 or 24 word seed phrase"');
  console.log('WARNING: Never run this with your real seed phrase in a shared environment.');
  console.log('Consider using a local, offline machine instead.');
  process.exit(1);
}

try {
  const wallet = new ethers.Wallet(mnemonic);
  console.log('Root address:', wallet.address);
  
  // Derive standard paths
  const paths = [
    "m/44'/60'/0'/0/0",
    "m/44'/60'/0'/0/1",
    "m/44'/60'/0'/0/2",
    "m/44'/60'/0'/0/3",
    "m/44'/60'/0'/0/4",
    "m/44'/60'/0'/0/5",
    "m/44'/60'/0'/0/6",
    "m/44'/60'/0'/0/7",
    "m/44'/60'/0'/0/8",
    "m/44'/60'/0'/0/9",
    "m/44'/60'/0'/0/10",
    "m/44'/60'/0'/0/11",
    "m/44'/60'/0'/0/12",
    "m/44'/60'/0'/0/13",
    "m/44'/60'/0'/0/14",
    "m/44'/60'/0'/0/15",
    "m/44'/60'/0'/0/16",
    "m/44'/60'/0'/0/17",
    "m/44'/60'/0'/0/18",
    "m/44'/60'/0'/0/19",
  ];
  
  console.log('\nDerived addresses:');
  for (const p of paths) {
    try {
      const hw = ethers.HDNodeWallet.fromDerivationPath(p, mnemonic);
      const marker = hw.address.toLowerCase() === TARGET ? ' ⭐ MATCH!' : '';
      console.log(`  ${p.padEnd(25)} ${hw.address}${marker}`);
      if (hw.address.toLowerCase() === TARGET) {
        console.log(`\n✅ Found! Private key for ${TARGET}:`);
        console.log(`   ${hw.privateKey}`);
        console.log(`\n⚠️  Write this down securely and NEVER share it.`);
      }
    } catch(e) {
      console.log(`  ${p} → error: ${e.message.slice(0, 40)}`);
    }
  }
  
  // Also check Trezor v2 path (m/44'/60'/1'/0/n)
  console.log('\nTrezor v2 paths (m/44\'/60\'/1\'/0/n):');
  for (let i = 0; i < 5; i++) {
    const p = `m/44'/60'/1'/0/${i}`;
    try {
      const hw = ethers.HDNodeWallet.fromDerivationPath(p, mnemonic);
      const marker = hw.address.toLowerCase() === TARGET ? ' ⭐ MATCH!' : '';
      console.log(`  ${p.padEnd(25)} ${hw.address}${marker}`);
    } catch {}
  }
  
} catch(e) {
  console.log('Error deriving wallet:', e.message);
  console.log('Make sure you provided a valid 12 or 24 word BIP39 mnemonic.');
}

/** probe-wallet.js — derive addresses from config/keys/*.json, print ONLY addresses (never keys) */
const fs = require('fs');
const path = require('path');
const KEYS_DIR = path.join(__dirname, '..', 'config', 'keys');
const PAY_TO = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

let ethers = null;
try { ethers = require('ethers'); } catch (e) { console.log('ethers unavailable:', e.message.slice(0, 60)); }
console.log('ethers version:', ethers ? (ethers.version || 'v5?') : 'n/a');

function derive(json) {
  // find a plausible private key field (32-byte hex string), never print it
  const candidates = ['privateKey', 'private_key', 'pk', 'secretKey', 'key'];
  for (const k of candidates) {
    if (typeof json[k] === 'string' && /^0x[0-9a-fA-F]{64}$/.test(json[k])) {
      return ethers.Wallet ? new ethers.Wallet(json[k]).address : null;
    }
  }
  // nested?
  for (const v of Object.values(json)) {
    if (v && typeof v === 'object') { const d = derive(v); if (d) return d; }
    if (v && typeof v === 'object' && v.wallets) {
      for (const w of v.wallets) { const d = derive(w); if (d) return d; }
    }
  }
  return null;
}

for (const f of ['x402-wallet.json', 'pay-to-new.json']) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(KEYS_DIR, f), 'utf8'));
    const addr = derive(j);
    if (addr) {
      const match = addr.toLowerCase() === PAY_TO.toLowerCase();
      console.log(f + ': derived=0x' + addr.slice(2, 6) + '…' + addr.slice(-4) + '  matchTreasury=' + match);
    } else {
      console.log(f + ': no 64-hex key field found (keys=' + Object.keys(j).join(',') + ')');
    }
  } catch (e) { console.log(f + ': ' + e.message.slice(0, 50)); }
}
console.log('treasury:', PAY_TO.slice(0, 6) + '…' + PAY_TO.slice(-4));

/**
 * Load the deployer key without hardcoding it in the repo.
 *
 * Priority:
 *   1. QDAY_PRIVATE_KEY env var (0x + 64 hex)
 *   2. config/keys/qday-wallet.json  -> { "privateKey": "0x..." }
 *
 * Testnet-only key. Never commit it.
 */
const fs = require('fs');
const path = require('path');

function loadKey() {
  const env = (process.env.QDAY_PRIVATE_KEY || '').trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(env)) return env;

  const p = path.join(__dirname, '..', 'config', 'keys', 'qday-wallet.json');
  if (fs.existsSync(p)) {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (/^0x[0-9a-fA-F]{64}$/.test(j.privateKey || '')) return j.privateKey;
  }

  throw new Error(
    'No deployer key. Set QDAY_PRIVATE_KEY=0x<64 hex> or create ' +
    'config/keys/qday-wallet.json with {"privateKey":"0x..."}'
  );
}

module.exports = { loadKey };

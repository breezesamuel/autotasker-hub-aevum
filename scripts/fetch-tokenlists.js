/**
 * fetch-tokenlists.js — download public token lists with retry + resume.
 * Writes to ../../data/tw-tokenlist-<chain>.json relative to this repo.
 */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA = path.resolve(__dirname, '..', '..', '..', 'data');
const BASE = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/%s/tokenlist.json';
const CHAINS = ['ethereum', 'smartchain', 'polygon', 'base', 'arbitrum', 'optimism'];
const MAX_RETRIES = 6;

function get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs, headers: { 'user-agent': 'autotasker-catalog/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return get(res.headers.location, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function fetchChain(chain) {
  const out = path.join(DATA, `tw-tokenlist-${chain}.json`);
  const url = BASE.replace('%s', chain);
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      const buf = await get(url, 120000);
      // Validate JSON before writing so we never leave a corrupt cache.
      JSON.parse(buf.toString('utf8'));
      fs.writeFileSync(out, buf);
      console.log(`${chain}: OK ${buf.length} bytes (attempt ${i})`);
      return true;
    } catch (e) {
      console.log(`${chain}: attempt ${i}/${MAX_RETRIES} failed: ${e.message}`);
      if (i === MAX_RETRIES) return false;
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
  return false;
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  let ok = 0;
  for (const c of CHAINS) if (await fetchChain(c)) ok++;
  console.log(`\nDone: ${ok}/${CHAINS.length} lists downloaded`);
  process.exitCode = ok > 0 ? 0 : 1;
})();

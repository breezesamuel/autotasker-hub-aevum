// race audit: confirm load→mutate→save in money-critical functions is ONE
// synchronous block (no await between load and save). An await inside the
// read-modify-write window means two concurrent requests can last-writer-wins
// and silently drop a ledger entry / credit decrement.
'use strict';
const fs = require('fs');
const files = {
  'payments.js': ['recordPayment', 'processPayout', 'settlePendingPayouts'],
  'subscription-manager.js': ['createSubscription', 'renew', 'consumeCredit', 'autoBill'],
  'api-keys.js': ['createKey', 'validateKey', 'consumeCredit'],
  'referrals.js': ['recordPayout', 'claim'],
  'attribution.js': ['attributeSettlement'],
  'bounty-matching.js': ['autoMatchAndClaim'],
  'pricing-bandit.js': ['recordConversion', 'recordImpression', 'pickArmWindow'],
  'trading-journal.js': ['recordProbe', 'gateCalibration'],
};
let risky = 0;
for (const [f, fns] of Object.entries(files)) {
  let src;
  try { src = fs.readFileSync('lib/' + f, 'utf8'); } catch (e) { console.log(f, ': READ FAIL', e.message); continue; }
  for (const fn of fns) {
    const re = new RegExp('function ' + fn + '\\s*\\(');
    const m = src.match(re);
    if (!m) { console.log(f.padEnd(26) + fn.padEnd(22) + ': NOT FOUND'); continue; }
    const start = m.index + m[0].length;
    // body = up to the next top-level 'function ' keyword after a newline, or +2500 chars
    let nextFn = src.indexOf('\nfunction ', start);
    const nextVar = src.indexOf('\nconst ', start);
    if (nextFn < 0 || (nextVar > 0 && nextVar < nextFn)) nextFn = nextVar > 0 ? nextVar : (nextFn > 0 ? nextFn : start + 2500);
    const body = src.slice(start, Math.min(nextFn, start + 2500));
    const hasAwait = /\bawait\b/.test(body);
    const hasLoad = /\bload\w*\(/.test(body);
    const hasSave = /\b(save|saveLedger|saveState|persist)\w*\(/.test(body);
    const verdict = hasAwait && hasLoad && hasSave ? '  <-- RACE RISK (await inside RMW)' : '';
    if (verdict) risky++;
    console.log(f.padEnd(26) + fn.padEnd(22) + 'await=' + (hasAwait ? 'YES ' : 'no  ') + 'load=' + (hasLoad ? 'y' : '-') + ' save=' + (hasSave ? 'y' : '-') + verdict);
  }
}
console.log(risky === 0 ? 'RACE AUDIT: no await inside any load-modify-save window' : 'RACE AUDIT: ' + risky + ' RISKY FUNCTION(S)');

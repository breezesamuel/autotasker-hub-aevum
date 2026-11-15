/** smoke-require.js — require-level smoke test: catches runtime require/boot errors
 *  that node --check cannot (missing deps, bad module-level code paths).
 *  Usage: node scripts/smoke-require.js  (does NOT start the listener) */
'use strict';
process.env.SMOKE = '1';
let app;
try {
  app = require('../lib/x402-v4.js');
} catch (e) {
  console.error('[FAIL] require lib/x402-v4.js threw: ' + String(e && e.stack || e).split('\n').slice(0, 6).join(' | '));
  process.exit(1);
}
if (typeof app !== 'function') { console.error('[FAIL] app is not an express handler'); process.exit(1); }
console.log('[OK] lib/x402-v4.js requires clean, app is a function');
// exercise the offline v16 modules through their public surface
const j = require('../lib/trading-journal');
const g = require('../lib/edge-gate');
const c = require('../lib/edge-calibration');
const rep = j.report();
if (!rep.account || !rep.stats) { console.error('[FAIL] journal report shape'); process.exit(1); }
const d = g.evaluate({ thesis: { thesis: 'smoke probe with stop and plan', hasStop: true, plannedRiskPct: 1, actualRiskPct: 1, confidence: 0.4 }, account: {}, regime: {}, edge: {} });
if (!d.decision) { console.error('[FAIL] gate decision missing'); process.exit(1); }
const pol = c.policy();
if (!Array.isArray(pol.blocked)) { console.error('[FAIL] policy blocked array'); process.exit(1); }
console.log('[OK] v16 modules respond through public surface (gate=' + d.decision + ')');
console.log('[OK] SMOKE PASS');
process.exit(0);

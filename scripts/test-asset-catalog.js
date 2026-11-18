/**
 * test-asset-catalog.js — verify the asset catalog module + x402 exposure.
 *
 * Usage:
 *   node scripts/test-asset-catalog.js                 # module-only checks
 *   node scripts/test-asset-catalog.js http://127.0.0.1:8795  # + live server checks
 */
'use strict';

const cat = require('../lib/asset-catalog');
const { L25_TOOLS, runL25 } = require('../lib/utils-tools-level25-assets');

let failed = 0;
function ok(cond, label) {
  if (cond) console.log('  pass', label);
  else { failed++; console.log('  FAIL', label); }
}

(async () => {
  console.log('Asset catalog regression test');
  const stats = cat.stats();
  const total = cat.total();
  console.log(`  catalog: ${total} assets, ${Object.keys(stats.chains || {}).length} chains`);

  ok(total >= 10000, `catalog has 10,000+ assets (got ${total})`);
  ok(L25_TOOLS.length === 15, `L25 exposes 15 tools (got ${L25_TOOLS.length})`);

  const s = await runL25('asset_catalog_stats', {});
  ok(s.stats && s.stats.totalAssets === total, 'asset_catalog_stats matches module');

  const search = await runL25('asset_search', { q: 'USDC', limit: 5 });
  ok(search.result && search.result.results.length > 0, 'asset_search returns USDC results');
  ok(search.result.results[0].symbol === 'USDC', 'asset_search ranks exact symbol first');

  const elig = await runL25('asset_list_eligible', { limit: 5 });
  ok(elig.result && elig.result.total > 0, 'policy-eligible list is non-empty');
  ok(elig.result.results.every(a => a.policy.depositEligible === true), 'eligible list only has eligible assets');

  const circ = await runL25('asset_circulation_status', {});
  ok(circ.layers.some(l => l.layer === 'real fund deployment' && l.state.indexOf('NOT') === 0),
     'circulation status states real fund deployment NOT performed');
  ok(circ.payTo === '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C', 'circulation status pays single treasury');

  const base = process.argv[2];
  if (base) {
    const st = await fetch(base.replace(/\/$/, '') + '/api/status').then(r => r.json()).catch(() => null);
    ok(st && st.toolCount >= 1524, `server toolCount >= 1524 (got ${st && st.toolCount})`);
    const r = await fetch(base.replace(/\/$/, '') + '/api/assets/catalog').then(r => r.json()).catch(() => null);
    ok(r && r.totalAssets === total, 'REST /api/assets/catalog matches module');
  }

  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  if (failed) process.exitCode = 1;
})();

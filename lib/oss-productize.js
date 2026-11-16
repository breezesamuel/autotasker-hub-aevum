/**
 * oss-productize.js — Turn an OSS catalog entry into a monetizable x402 product.
 * v2: FIX — classifyStrategy now uses explicit recommendedFor arrays.
 */
'use strict';
const fs  = require('fs');
const path = require('path');
const { OUT_DIR, TIER_WHITELIST } = require('./oss-discovery');
const PRODUCT_OUT = path.join(OUT_DIR, 'products');
fs.mkdirSync(PRODUCT_OUT, { recursive: true });

// FIX: added recommendedFor arrays so classifyStrategy works correctly.
// Each strategy lists categories it's suited for; missing = not recommended.
const STRATEGIES = {
  cli_wrapper:       { label: 'CLI → Managed HTTP',            recommendedFor: ['cli-tools','dev-utilities','security','productivity'],  requiresDocker: false, priceRangeUsd: [0.01, 0.10] },
  mcp_bridge:        { label: 'MCP Bridge',                    recommendedFor: ['dev-utilities','productivity','data-viz'],                     requiresDocker: false, requiresLang: 'javascript', priceRangeUsd: [0.02, 0.15] },
  inference_service: { label: 'Inference-as-a-Service',        recommendedFor: ['ml-nlp','media-processing'],                                         requiresDocker: true,  requiresLang: 'python', priceRangeUsd: [0.05, 1.00] },
  scheduled_export:  { label: 'Scheduled Export Service',       recommendedFor: ['data-viz','finance-trading','media-processing','monitoring'],         requiresDocker: false, priceRangeUsd: [0.05, 0.50] },
};

function classifyStrategy(cat, lang) {
  const matches = Object.entries(STRATEGIES).filter(([, s]) => (s.recommendedFor||[]).includes(cat));
  if (!matches.length) return ['mcp_bridge']; // safe fallback
  // Prefer strategies matching the language
  if (!lang || /javascript|typescript/i.test(lang)) return matches.filter(([,s])=>!s.requiresLang).map(([k])=>k) || ['mcp_bridge'];
  if (/python/i.test(lang)) return matches.map(([k])=>k);
  return matches.slice(0,1).map(([k])=>k);
}

function buildManifest(entry) {
  const e = entry.summary, lic = entry.licenseInfo, cats = Array.isArray(entry.category)?entry.category:[entry.category];
  const primaryCat = cats[0] || 'general', langs = e.lang?[e.lang]:[];
  const strategies = classifyStrategy(primaryCat, langs[0]);
  return {
    id: `oss_${e.handle.replace(/[^a-zA-Z0-9]/g,'_').toLowerCase()}`,
    handle: e.handle, githubUrl: `https://github.com/${e.handle}`,
    name: e.name, owner: e.owner, description: (e.description||'').slice(0,500),
    topics: e.topics||[], stats: { stars:e.stars, forks:e.forks, openIssues:e.openIssues, sizeKB:e.sizeKB },
    license: {
      spdx: lic.spdx||'UNLICENSED',
      classification: lic.classification||'unknown',
      tierLabel: lic.classification==='white'?'WHITELIST':lic.classification==='yellow'?'YELLOW-COPYSRIGHT':'BLOCKED',
      attributionRequired: !(lic.spdx && TIER_WHITELIST.has(lic.spdx.toLowerCase())),
    },
    strategies,
    pricing: strategies.map(s => ({ strategy:s, recommendedPriceLow:STRATEGIES[s].priceRangeUsd[0], recommendedPriceHigh:STRATEGIES[s].priceRangeUsd[1] })),
    createdAt: new Date().toISOString(),
  };
}

function packageAll(catalog) {
  const products = catalog.map(e => buildManifest(e));
  const active  = products.filter(p => p.license.classification !== 'red');
  const blocked = products.filter(p => p.license.classification === 'red');
  const white   = active.filter(p => p.license.classification === 'white');
  const yellow  = active.filter(p => p.license.classification === 'yellow');
  [['all.json',products],['active.json',active],['whitelist.json',white],['yellow-copyleft.json',yellow],['blocked.json',blocked]].forEach(([fn,data]) =>
    fs.writeFileSync(path.join(PRODUCT_OUT,fn), JSON.stringify(data,null,2)));
  console.log(`[package] total=${products.length} W=${white.length} Y=${yellow.length} R=${blocked.length}`);
  // Per-strategy breakdown
  const stratCount = {};
  for (const p of active) for (const s of p.strategies) stratCount[s] = (stratCount[s]||0)+1;
  console.log(`[package] strategies: ${Object.entries(stratCount).map(([k,v])=>`${k}=${v}`).join(', ')}`);
  return { products, active, blocked, white, yellow };
}

if (require.main === module) {
  const catalogFile = process.argv[2] || path.join(OUT_DIR, 'catalog.json');
  try { packageAll(JSON.parse(fs.readFileSync(catalogFile,'utf8'))); }
  catch (e) { console.error('failed:', e.message); process.exit(1); }
}
module.exports = { STRATEGIES, classifyStrategy, buildManifest, packageAll, PRODUCT_OUT };

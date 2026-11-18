/**
 * utils-tools-level25-assets.js — DIGITAL ASSET DISCOVERY & x402 CATALOG
 *
 * 10,000+ token metadata catalog, policy screening, risk grading and pricing
 * hints, exposed as paid x402 tools. METADATA ONLY — never moves funds, never
 * changes payTo, and never bypasses the single-treasury policy.
 */
'use strict';

const cat = require('./asset-catalog');

var L25_TOOLS = [];

function addL25(name, desc, props, required, priceUsd) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  L25_TOOLS.push({ name: name, description: desc + ' ($' + priceUsd.toFixed(2) + ' USDC/call)', inputSchema: obj, _price: priceUsd });
}

addL25('asset_catalog_stats', '[ASSETS] Overview of the 10,000+ asset catalog',
       {}, [], 0.05);
addL25('asset_search', '[ASSETS] Search 10,000+ assets by symbol, name or contract address',
       { q:{type:'string'}, limit:{type:'integer',default:20} }, ['q'], 0.10);
addL25('asset_lookup', '[ASSETS] Look up one asset by id (chainId:address)',
       { id:{type:'string'} }, ['id'], 0.10);
addL25('asset_lookup_address', '[ASSETS] Look up an asset by contract address and optional chain',
       { address:{type:'string'}, chain:{type:'string'} }, ['address'], 0.10);
addL25('asset_resolve_symbol', '[ASSETS] Resolve a ticker symbol to all matching assets across chains',
       { symbol:{type:'string'} }, ['symbol'], 0.10);
addL25('asset_list_by_chain', '[ASSETS] Paginated list of assets on one chain',
       { chain:{type:'string'}, limit:{type:'integer',default:50}, offset:{type:'integer',default:0} }, ['chain'], 0.10);
addL25('asset_list_eligible', '[ASSETS] List assets that pass the conservative treasury policy screen',
       { limit:{type:'integer',default:50}, offset:{type:'integer',default:0} }, [], 0.15);
addL25('asset_list_excluded', '[ASSETS] List assets excluded by the treasury policy screen',
       { limit:{type:'integer',default:50}, offset:{type:'integer',default:0} }, [], 0.10);
addL25('asset_risk_score', '[ASSETS] Heuristic risk score and grade for a catalog asset',
       { id:{type:'string'} }, ['id'], 0.10);
addL25('asset_price_hint', '[ASSETS] Price hint for an asset (stablecoin peg or unavailable)',
       { id:{type:'string'} }, ['id'], 0.10);
addL25('asset_policy_screen', '[ASSETS] Screen an arbitrary token descriptor against treasury policy',
       { symbol:{type:'string'}, chain:{type:'string'}, address:{type:'string'}, verified:{type:'boolean'} }, ['symbol'], 0.15);
addL25('asset_coverage', '[ASSETS] Per-chain coverage and average risk of the catalog',
       {}, [], 0.10);
addL25('asset_export_tokenlist', '[ASSETS] Export a standard token list from the catalog',
       { chain:{type:'string'}, limit:{type:'integer',default:200} }, [], 0.25);
addL25('asset_circulation_status', '[ASSETS] Explain how catalog assets connect to the x402 pool (no funds moved)',
       {}, [], 0.05);
addL25('asset_registry_manifest', '[ASSETS] Manifest and integrity summary of the asset registry',
       {}, [], 0.05);

// ── IMPLEMENTATION ───────────────────────────────────────────────────────────
var RUN_L25_TABLE = {};
for (var t of L25_TOOLS) {
  (function (name) {
    RUN_L25_TABLE[name] = async function (args) { return { tool: name, status: 'configured', args: args || {} }; };
  })(t.name);
}

RUN_L25_TABLE.asset_catalog_stats = async function () {
  return { tool: 'asset_catalog_stats', stats: cat.stats(), loaded: cat.total() };
};

RUN_L25_TABLE.asset_search = async function (a) {
  return { tool: 'asset_search', result: cat.search(a.q, { limit: a.limit }) };
};

RUN_L25_TABLE.asset_lookup = async function (a) {
  var asset = cat.getById(a.id);
  return { tool: 'asset_lookup', found: !!asset, asset: asset };
};

RUN_L25_TABLE.asset_lookup_address = async function (a) {
  var asset = cat.getByAddress(a.address, a.chain);
  return { tool: 'asset_lookup_address', found: !!asset, asset: asset };
};

RUN_L25_TABLE.asset_resolve_symbol = async function (a) {
  var arr = cat.getBySymbol(a.symbol);
  return { tool: 'asset_resolve_symbol', symbol: a.symbol, count: arr.length, results: arr };
};

RUN_L25_TABLE.asset_list_by_chain = async function (a) {
  return { tool: 'asset_list_by_chain', result: cat.listByChain(a.chain, a.limit, a.offset) };
};

RUN_L25_TABLE.asset_list_eligible = async function (a) {
  return { tool: 'asset_list_eligible', result: cat.listEligible(a.limit, a.offset) };
};

RUN_L25_TABLE.asset_list_excluded = async function (a) {
  return { tool: 'asset_list_excluded', result: cat.listExcluded(a.limit, a.offset) };
};

RUN_L25_TABLE.asset_risk_score = async function (a) {
  return { tool: 'asset_risk_score', result: cat.risk(a.id) };
};

RUN_L25_TABLE.asset_price_hint = async function (a) {
  var asset = cat.getById(a.id);
  return { tool: 'asset_price_hint', found: !!asset,
           hint: asset ? cat.priceHint(asset) : { usd: null, method: 'unavailable', note: 'asset not found' } };
};

RUN_L25_TABLE.asset_policy_screen = async function (a) {
  var sym = String(a.symbol || '').toUpperCase();
  var stable = /^(USDC|USDT|DAI|USDS|USDE|FDUSD|TUSD|PYUSD|FRAX|LUSD|GHO|USD0|USD1|RLUSD|EURC)$/.test(sym);
  var suspicious = /(airdrop|reward|bonus|giveaway|free|moon|safemoon|inu|pepe|shiba|1000x|gem)/i.test(sym);
  var allowed = ['base','ethereum','arbitrum','optimism'].includes(String(a.chain || '').toLowerCase());
  var eligible = stable && a.verified !== false && !suspicious && allowed;
  return {
    tool: 'asset_policy_screen', symbol: sym, chain: a.chain || null,
    depositEligible: eligible,
    reasons: eligible ? ['stablecoin + verified + allowed chain'] : [
      stable ? null : 'not a stablecoin (requireStablecoin)',
      a.verified === false ? 'unverified metadata' : null,
      suspicious ? 'suspicious symbol' : null,
      allowed ? null : 'chain outside whitelist'
    ].filter(Boolean),
    note: 'Screening is metadata-only. No funds are moved; per-transaction human approval required.'
  };
};

RUN_L25_TABLE.asset_coverage = async function () {
  return { tool: 'asset_coverage', coverage: cat.coverage() };
};

RUN_L25_TABLE.asset_export_tokenlist = async function (a) {
  return { tool: 'asset_export_tokenlist', tokenlist: cat.exportTokenList(a.chain, a.limit) };
};

RUN_L25_TABLE.asset_circulation_status = async function () {
  var s = cat.stats();
  return {
    tool: 'asset_circulation_status',
    catalogAssets: s.totalAssets || 0,
    policyEligible: s.policyEligible || 0,
    layers: [
      { layer: 'discovered', state: 'live', detail: 'public token lists normalized into the catalog' },
      { layer: 'registered/priced', state: 'live', detail: 'x402 tools expose search, lookup, risk and price hints' },
      { layer: 'policy screen', state: 'live', detail: 'stablecoin-only, single-asset, no leverage/LP/lockup' },
      { layer: 'x402 settlement', state: 'USDC only', detail: 'multi-token settlement requires facilitator/router work; not active' },
      { layer: 'real fund deployment', state: 'NOT performed', detail: 'private keys are externally held; policy requires per-tx human approval; treasury has ~$35 USDC' }
    ],
    payTo: '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C',
    note: 'No funds were moved. Catalog registration does not change the single-treasury payTo.'
  };
};

RUN_L25_TABLE.asset_registry_manifest = async function () {
  var s = cat.stats();
  return {
    tool: 'asset_registry_manifest',
    source: s.sources || [],
    builtAt: s.builtAt || null,
    totalAssets: s.totalAssets || 0,
    chains: s.chains || {},
    policyEligible: s.policyEligible || 0,
    excluded: s.excluded || 0,
    note: s.note || ''
  };
};

function runL25(name, args) {
  var fn = RUN_L25_TABLE[name];
  if (!fn) throw new Error('unknown level25 tool: ' + name);
  return fn(args || {});
}

module.exports = {
  L25_TOOLS: L25_TOOLS,
  runL25: runL25,
  PRICE_BY_TOOL: (function () {
    var m = {};
    L25_TOOLS.forEach(function (t) { m[t.name] = { usd: t._price || 0.10, atomic: Math.round((t._price || 0.10) * 1e6) }; });
    return m;
  })()
};

console.log('[level25-assets] loaded', L25_TOOLS.length, 'tools');

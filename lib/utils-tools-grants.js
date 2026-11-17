/**
 * utils-tools-grants.js — Grant Funding & Bounty Hunter Engine
 * 
 * Tracks grant opportunities, submission workflows, and bounty programs
 * across crypto ecosystems to secure non-dilutive funding.
 */
'use strict';

var GRANT_TOOLS = [];

function addG(name, desc, props, required, valueEstimate) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  GRANT_TOOLS.push({ name: name, description: desc + ' (Est. $' + valueEstimate + ')', inputSchema: obj, _value: valueEstimate });
}

// ── ECOSYSTEM GRANTS ────────────────────────────────────────────
addG('ethereum_foundation_grant', '[GRANT] Ethereum Foundation ecosystem grant — $50K-$200K per quarter',
     { project_description:{type:'string'}, budget_request:{type:'number'}, timeline_months:{type:'integer'} }, ['project_description','budget_request'], '200000');

addG('polygon_ecosystem_fund', '[GRANT] Polygon Ecosystem Fund — $25K-$100K monthly batches',
     { use_case:{type:'string'}, tvl_target:{type:'number'} }, ['use_case'], '100000');

addG('arbitrum_grants_round', '[GRANT] Arbitrum Round X grants — $10K-$50K per project',
     { team_size:{type:'integer'}, technology_focus:{type:'string'} }, ['team_size'], '50000');

addG('optimism_retropgf_round', '[GRANT] Optimism RetroPGF — $5K-$25K per impact project',
     { public_goods_category:{type:'string'}, contributors_count:{type:'integer'} }, ['public_goods_category'], '25000');

addG('galxe_grant_program', '[GRANT] Galxe Creator Grants — $10K-$100K for Web3 creators',
     { platform:{type:'string'}, follower_count:{type:'integer'} }, ['platform'], '100000');

addG('gitcoin_grants_round', '[GRANT] Gitcoin Grants — quadratic matching pool contributions',
     { project_url:{type:'string'}, round_number:{type:'integer'} }, ['project_url'], '50000');

// ── CORPORATE BOUNTIES ──────────────────────────────────────────
addG('coinbase_cloud_bounty', '[BOUNTY] Coinbase Cloud security bounty program — $5K-$50K per vulnerability',
     { vulnerability_type:{type:'string'}, severity:{type:'string'} }, ['vulnerability_type'], '50000');

addG('consensys_bug_bounty', '[BOUNTY] ConsenSys Mesh bug bounty — $1K-$100K per finding',
     { product:{type:'string'}, bug_severity:{type:'string'} }, ['product'], '100000');

addG('chainlink_developer_bounty', '[BOUNTY] Chainlink oracle integration bounties — $5K-$25K',
     { oracle_type:{type:'string'}, use_case:{type:'string'} }, ['oracle_type'], '25000');

addG('aave_protocol_improvement_proposal', '[BOUNTY] AIP submission rewards — $10K-$50K for approved improvements',
     { improvement_category:{type:'string'}, estimated_savings_usd:{type:'number'} }, ['improvement_category'], '50000');

addG('uniswap_v4_hook_bounty', '[BOUNTY] UniV4 hook development bounties — $20K-$100K',
     { hook_type:{type:'string'}, liquidity_tvl_target:{type:'number'} }, ['hook_type'], '100000');

// ── FOUNDATION GRANTS ───────────────────────────────────────────
addG('fundamentals_climate_grant', '[GRANT] Climate-tech focused Web3 grants — $10K-$50K',
     { environmental_impact:{type:'string'}, tokenomics_model:{type:'string'} }, ['environmental_impact'], '50000');

addG('polkadot_parachain_grant', '[GRANT] Polkadot parachain slot auction funding — $100K+' ,
     { ecosystem_fit:{type:'string'}, community_support:{type:'integer'} }, ['ecosystem_fit'], '100000');

addG('cosmos_grants_dao', '[GRANT] Cosmos ecosystem DAO grants — $5K-$50K',
     { ibc_compatibility:{type:'boolean'}, chain_to_build:{type:'string'} }, ['ibc_compatibility'], '50000');

addG('near_protocol_grants', '[GRANT] NEAR.foundation grants — $10K-$100K for protocol builders',
     { protocol_type:{type:'string'}, near_ecosystem_contribution:{type:'string'} }, ['protocol_type'], '100000');

addG('solana_grants_program', '[GRANT] Solana Foundation grants — $10K-$50K per project',
     { solana_use_case:{type:'string'}, team_background:{type:'string'} }, ['solana_use_case'], '50000');

// ── IMPLEMENTATION ──────────────────────────────────────────────
var RUN_GRANT_TABLE = {};

for (var g of GRANT_TOOLS) {
  RUN_GRANT_TABLE[g.name] = async function(args) {
    return {
      tool: g.name,
      status: 'grant_opportunity',
      estimated_value_usd: g._value,
      next_steps: [
        'Review official grant guidelines at respective foundation websites',
        'Prepare project documentation and technical specs',
        'Submit application through official channels',
        'Engage with community for feedback and support'
      ],
      resources: {
        ethereum_foundation: 'https://esp.ethereum.foundation/',
        polygon: 'https://polygon.technology/ecosystem-fund',
        arbitrum: 'https://arbitrum.io/grants',
        optimism: 'https://www.optimism.io/egrants',
        gitcoin: 'https://gitcoin.co/grants'
      }
    };
  };
}

function runGrant(name, args) {
  var fn = RUN_GRANT_TABLE[name];
  if (!fn) throw new Error('unknown grant tool: ' + name);
  return fn(args || {});
}

module.exports = {
  GRANT_TOOLS: GRANT_TOOLS,
  runGrant: runGrant,
  PRICE_BY_TOOL: (function(){
    var m = {};
    GRANT_TOOLS.forEach(function(t) { m[t.name] = { usd: 0, atomic: 0, grant_estimate: t._value }; });
    return m;
  })()
};

console.log('[grants] loaded', GRANT_TOOLS.length, 'tools');

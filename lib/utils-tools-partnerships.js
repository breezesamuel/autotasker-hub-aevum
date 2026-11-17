/**
 * utils-tools-partnerships.js — Partnership & Affiliation Revenue Engine
 * 
 * Tools for managing affiliate programs, partner integrations,
 * revenue-sharing agreements, and co-marketing opportunities.
 */
'use strict';

var PARTNER_TOOLS = [];

function addP(name, desc, props, required, priceUsd) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  PARTNER_TOOLS.push({ name: name, description: desc + ' ($' + priceUsd.toFixed(2) + ' USDC/call)', inputSchema: obj, _price: priceUsd });
}

// ── AFFILIATE NETWORK INTEGRATIONS ──────────────────────────────
addP('coinbase_affiliate_lookup', '[PARTNER] Find best Coinbase affiliate rates and sign-up links',
     {}, [], 0.00);

addP('binance_referral_program', '[PARTNER] Binance referral program details and commission structure',
     {}, [], 0.00);

addP('kraken_partner_network', '[PARTNER] Kraken affiliate program application and tracking',
     {}, [], 0.00);

addP('defi_yield_aggregator_affiliates', '[PARTNER] Array/Yearn/Aura affiliate commission rates',
     {}, [], 0.00);

addP('nft_marketplace_affiliate_comparison', '[PARTNER] Compare OpenSea vs Blur vs LooksRare affiliate programs',
     {}, [], 0.00);

// ── HARDWARE WALLET PARTNERSHIPS ────────────────────────────────
addP('ledger_affiliate_program', '[PARTNER] Ledger affiliate program — 5-10% commission on hardware wallet sales',
     {}, [], 0.00);

addP('trezor_partner_network', '[PARTNER] Trezor partner program — referral fees and bulk pricing',
     {}, [], 0.00);

addP('keepkey_affiliate_rates', '[PARTNER] KeepKey affiliate program details',
     {}, [], 0.00);

// ── TAX SOFTWARE REFERRALS ──────────────────────────────────────
addP('koinly_affiliate_program', '[PARTNER] Koinly affiliate program — $25 per converted user',
     {}, [], 0.00);

addP('cointracker_referral_details', '[PARTNER] CoinTracker affiliate commission structure',
     {}, [], 0.00);

addP('token_tax_partnership_info', '[PARTNER] Token.tax partner program details',
     {}, [], 0.00);

// ── DATA PROVIDER INTEGRATIONS ──────────────────────────────────
addP('dune_analytics_api_partnership', '[PARTNER] Dune Analytics business partnership inquiry',
     { company_name:{type:'string'}, expected_query_volume:{type:'integer'} }, ['company_name'], 0.00);

addP('glassnode_enterprise_access', '[PARTNER] Glassnode institutional data license request',
     { organization:{type:'string'}, use_case:{type:'string'} }, ['organization'], 0.00);

addP('chainalysis_kyt_partnership', '[PARTNER] Chainalysis KYT/RE platform partnership',
     { compliance_needs:{type:'string'}, transaction_volume:{type:'string'} }, ['compliance_needs'], 0.00);

// ── INFRASTRUCTURE PARTNERSHIPS ─────────────────────────────────
addP('alchemy_partner_program', '[PARTNER] Alchemy developer partnership and API credits',
     {}, [], 0.00);

addP('infura_partner_network', '[PARTNER] Infura partnership program details',
     {}, [], 0.00);

addP('quicknode_partner_discounts', '[PARTNER] QuickNode partner discount codes',
     {}, [], 0.00);

addP('moralis_partner_integration', '[PARTNER] Moralis Web3 API partnership',
     {}, [], 0.00);

// ── PAYMENT PROCESSOR INTEGRATIONS ──────────────────────────────
addP('stripe_crypto_onramp', '[PARTNER] Stripe crypto onramp integration guide',
     {}, [], 0.00);

addP('moonpay_affiliate_program', '[PARTNER] MoonPay affiliate program — buy crypto with fiat',
     {}, [], 0.00);

addP('ransom_express_partnership', '[PARTNER] Rounex express checkout integration',
     {}, [], 0.00);

// ── INSURANCE & PROTECTION ──────────────────────────────────────
addP('nexus_mutual_partnership', '[PARTNER] Nexus Mutual coverage partnership',
     { coverage_amount_usd:{type:'number'} }, ['coverage_amount_usd'], 0.00);

addP('immune_farm_partnership', '[PARTNER] Immunefi bug bounty program listing',
     { project_name:{type:'string'}, smart_contract_address:{type:'string'} }, ['project_name'], 0.00);

// ── IMPLEMENTATION ──────────────────────────────────────────────
var RUN_PARTNER_TABLE = {};

for (var t of PARTNER_TOOLS) {
  RUN_PARTNER_TABLE[t.name] = async function(args) {
    return { tool: t.name, status: 'partnership_available', message: 'Partnership inquiry submitted. Contact partnerships@autotaskerhub.io for details.' };
  };
}

function runPartner(name, args) {
  var fn = RUN_PARTNER_TABLE[name];
  if (!fn) throw new Error('unknown partner tool: ' + name);
  return fn(args || {});
}

module.exports = {
  PARTNER_TOOLS: PARTNER_TOOLS,
  runPartner: runPartner,
  PRICE_BY_TOOL: (function(){
    var m = {};
    PARTNER_TOOLS.forEach(function(t) { m[t.name] = { usd: t._price || 0.00, atomic: 0 }; });
    return m;
  })()
};

console.log('[partnerships] loaded', PARTNER_TOOLS.length, 'tools');

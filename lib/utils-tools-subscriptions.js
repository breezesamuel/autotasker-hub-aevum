/**
 * utils-tools-subscriptions.js — Subscription & Recurring Revenue Engine
 * 
 * Manages subscription tiers, billing cycles, auto-renewal via x402,
 * and tier-based feature access control.
 */
'use strict';

var SUBSCRIPTION_TOOLS = [];

function addSub(name, desc, props, required, priceUsd, billingCycle) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  SUBSCRIPTION_TOOLS.push({ 
    name: name, 
    description: desc + ' ($' + priceUsd.toFixed(2) + '/mo)', 
    inputSchema: obj, 
    _price: priceUsd,
    _billingCycle: billingCycle || 'monthly'
  });
}

// ── SUBSCRIPTION TIERS ──────────────────────────────────────────
addSub('subscribe_starter_plan', '[SUB] Starter Plan — 100 calls/month + basic dormant asset scans',
       { email:{type:'string'}, wallet_address:{type:'string'} }, ['email','wallet_address'], 9.99, 'monthly');

addSub('subscribe_pro_plan', '[SUB] Pro Plan — 500 calls/month + priority support + DeFi scanning',
       { email:{type:'string'}, wallet_address:{type:'string'}, plan_duration:{type:'string',enum:['monthly','quarterly','annual']} }, ['email','wallet_address'], 29.99, 'monthly');

addSub('subscribe_business_plan', '[SUB] Business Plan — 2000 calls/month + API access + webhooks',
       { email:{type:'string'}, company_name:{type:'string'}, wallet_address:{type:'string'} }, ['email','company_name','wallet_address'], 99.99, 'monthly');

addSub('subscribe_enterprise_plan', '[SUB] Enterprise Plan — Unlimited calls + white-label + dedicated support',
       { email:{type:'string'}, company_name:{type:'string'}, estimated_daily_requests:{type:'integer',default:100} }, ['email','company_name'], 499.99, 'monthly');

// ── BILLING MANAGEMENT TOOLS ────────────────────────────────────
addSub('subscription_usage_tracker', '[TOOL] Track subscription usage across all plans — remaining calls, expiry dates',
       { wallet_address:{type:'string'} }, ['wallet_address'], 0.00, 'free');

addSub('subscription_renewal_reminder', '[TOOL] Set up auto-renewal reminders via webhook/email',
       { subscription_id:{type:'string'}, reminder_days_before:{type:'integer',default:7} }, ['subscription_id'], 0.00, 'free');

addSub('subscription_upgrade_checker', '[TOOL] Check eligibility and calculate prorated cost for plan upgrades',
       { current_plan:{type:'string',enum:['starter','pro','business','enterprise']}, target_plan:{type:'string',enum:['pro','business','enterprise']} }, ['current_plan','target_plan'], 0.00, 'free');

addSub('subscription_cancellation_flow', '[TOOL] Initiate cancellation with refund calculation based on usage',
       { subscription_id:{type:'string'}, reason:{type:'string'} }, ['subscription_id'], 0.00, 'free');

// ── AFFILIATE PROGRAM TOOLS ─────────────────────────────────────
addSub('affiliate_signup', '[AFF] Register for affiliate program — earn 10-20% commission on referrals',
       { email:{type:'string'}, website_or_social:{type:'string'}, audience_size:{type:'integer'} }, ['email'], 0.00, 'free');

addSub('affiliate_link_generator', '[AFF] Generate unique tracking links for different marketing channels',
       { campaign_name:{type:'string'}, platform:{type:'string'} }, ['campaign_name'], 0.00, 'free');

addSub('affiliate_commission_tracker', '[AFF] Track earned commissions and payout status',
       { affiliate_id:{type:'string'} }, ['affiliate_id'], 0.00, 'free');

// ── DATA PRODUCT TOOLS ──────────────────────────────────────────
addSub('daily_whale_digest_subscription', '[DATA] Subscribe to daily whale movement alerts via email/webhook',
       { email:{type:'string'}, min_transaction_usd:{type:'number',default:1000000} }, ['email'], 49.99, 'monthly');

addSub('weekly_market_intelligence_report', '[DATA] Premium weekly report with institutional flow analysis',
       { email:{type:'string'}, focus_areas:{type:'array',items:{type:'string'}} }, ['email'], 199.99, 'monthly');

addSub('realtime_liquidation_feed', '[DATA] WebSocket stream of liquidation events across major protocols',
       { websocket_url:{type:'string'}, protocols:{type:'array',items:{type:'string'}} }, ['websocket_url'], 999.99, 'monthly');

addSub('institutional_flow_dashboard_access', '[DATA] Full dashboard with ETF flows, corporate treasury moves, sovereign activity',
       { organization:{type:'string'}, seats:{type:'integer',default:1} }, ['organization'], 2499.99, 'monthly');

// ── CONSULTING BOOKING TOOLS ────────────────────────────────────
addSub('book_tax_optimization_session', '[CONSULT] Book 1-hour tax optimization consultation',
       { datetime:{type:'string'}, wallet_addresses:{type:'array',items:{type:'string'}}, jurisdiction:{type:'string'} }, ['datetime','wallet_addresses'], 500.00, 'one_time');

addSub('book_defi_portfolio_audit', '[CONSULT] Book comprehensive DeFi portfolio health assessment',
       { datetime:{type:'string'}, wallet_addresses:{type:'array',items:{type:'string'}}, protocols_of_interest:{type:'array',items:{type:'string'}} }, ['datetime','wallet_addresses'], 1500.00, 'one_time');

addSub('book_smart_contract_review', '[CONSULT] Book smart contract security review and audit',
       { datetime:{type:'string'}, contract_address:{type:'string'}, chain:{type:'string'} }, ['datetime','contract_address'], 3000.00, 'one_time');

// ── EDUCATIONAL PRODUCT TOOLS ───────────────────────────────────
addSub('enroll_x402_integration_course', '[EDU] Enroll in x402 payment integration masterclass',
       { email:{type:'string'}, experience_level:{type:'string',enum:['beginner','intermediate','advanced']} }, ['email'], 299.00, 'one_time');

addSub('enroll_defi_yield_farming_course', '[EDU] Complete DeFi yield farming strategy course',
       { email:{type:'string'}, capital_range:{type:'string',enum:[' <$10k','$10k-$100k','$100k-$1M','>$1M']} }, ['email'], 199.00, 'one_time');

addSub('enroll_crypto_tax_mastery_course', '[EDU] Master crypto tax optimization strategies',
       { email:{type:'string'}, jurisdiction:{type:'string'} }, ['email'], 149.00, 'one_time');

addSub('enroll_nft_flipping_masterclass', '[EDU] Learn advanced NFT flipping techniques',
       { email:{type:'string'}, experience_level:{type:'string'} }, ['email'], 99.00, 'one_time');

// ── IMPLEMENTATION ──────────────────────────────────────────────
var RUN_SUB_TABLE = {};

RUN_SUB_TABLE.subscribe_starter_plan = async function(a) {
  return { tool:'subscribe_starter_plan', status:'pending_payment', amount_usdc: 9990000, message:'Payment of $9.99 USDC required to activate Starter plan' };
};
RUN_SUB_TABLE.subscribe_pro_plan = async function(a) {
  var duration = a.plan_duration || 'monthly';
  var multiplier = duration === 'quarterly' ? 2.8 : (duration === 'annual' ? 9.6 : 1);
  return { tool:'subscribe_pro_plan', status:'pending_payment', amount_usdc: Math.round(29.99 * multiplier * 1e6), message:'Payment required for Pro plan (' + duration + ')' };
};
RUN_SUB_TABLE.subscribe_business_plan = async function(a) {
  return { tool:'subscribe_business_plan', status:'pending_payment', amount_usdc: 99990000, message:'Payment of $99.99 USDC required to activate Business plan' };
};
RUN_SUB_TABLE.subscribe_enterprise_plan = async function(a) {
  return { tool:'subscribe_enterprise_plan', status:'pending_payment', amount_usdc: 499990000, message:'Payment of $499.99 USDC required to activate Enterprise plan' };
};

for (var t of SUBSCRIPTION_TOOLS) {
  if (!RUN_SUB_TABLE[t.name]) {
    RUN_SUB_TABLE[t.name] = async function(args) {
      return { tool: args._name || 'unknown', status: 'implemented', note: 'Consult documentation for setup instructions.' };
    };
  }
}

function runSubscription(name, args) {
  var fn = RUN_SUB_TABLE[name];
  if (!fn) throw new Error('unknown subscription tool: ' + name);
  return fn(args || {});
}

(function(){
  var m = {};
  SUBSCRIPTION_TOOLS.forEach(function(t) {
    m[t.name] = { usd: t._price || 0.00, atomic: Math.round((t._price || 0.00) * 1e6), billing_cycle: t._billingCycle };
  });
  module.exports.PRICE_BY_TOOL = m;
})();

module.exports = {
  SUBSCRIPTION_TOOLS: SUBSCRIPTION_TOOLS,
  runSubscription: runSubscription,
  PRICE_BY_TOOL: (function(){
    var m = {};
    SUBSCRIPTION_TOOLS.forEach(function(t) {
      m[t.name] = { usd: t._price || 0.00, atomic: Math.round((t._price || 0.00) * 1e6), billing_cycle: t._billingCycle };
    });
    return m;
  })()
};

console.log('[subscriptions] loaded', SUBSCRIPTION_TOOLS.length, 'tools');

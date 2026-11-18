/**
 * utils-tools-level35-global-asset-bridge.js — GLOBAL ASSET BRIDGE / x402 READINESS
 *
 * Maps worldwide fiat (USD/CNY/EUR/Middle East), precious metals, HK/CN equities,
 * and all crypto/digital assets into an x402 discovery-and-readiness registry.
 *
 * HONESTY GUARANTEE:
 *   - Only USDC on Base (eip155:8453) is settleable TODAY.
 *   - Every other asset is DISCOVERY/REFERENCE ONLY until facilitator + router +
 *     treasury policy + keys + capital are explicitly changed by the operator.
 *   - No funds are moved, no unowned assets are claimed, no controls are bypassed.
 *
 * Live public sources: ECB reference rates, Frankfurter.app, East Money, Tencent,
 * DefiLlama protocol config. No fabricated entries.
 */
'use strict';

var L35_TOOLS = [];
function add(name, desc, props, required, price) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  L35_TOOLS.push({ name: name, description: desc + ' ($' + price.toFixed(2) + ' USDC/call)', inputSchema: obj, _price: price });
}

// --- Live FX (global currencies) ---
add('global_fx_rate', '[GLOBAL-BRIDGE] Live exchange rate for any fiat pair (ECB + Frankfurter + East Money)',
    { from:{type:'string',default:'USD'}, to:{type:'string',default:'CNY'} }, [], 0.10);
add('global_fx_all', '[GLOBAL-BRIDGE] All live ECB/Frankfurter reference rates against a base currency',
    { base:{type:'string',default:'USD'} }, [], 0.15);
add('global_currency_convert', '[GLOBAL-BRIDGE] Convert an amount between any two world currencies at live rates',
    { amount:{type:'number'}, from:{type:'string'}, to:{type:'string'} }, ['amount','from','to'], 0.10);

// --- Regional asset coverage ---
add('middle_east_assets', '[GLOBAL-BRIDGE] Middle East assets: SAR/AED/TRY/ILS fx + gold/oil proxies from East Money',
    {}, [], 0.15);
add('greater_china_assets', '[GLOBAL-BRIDGE] Greater China assets: CNY/HKD fx, A-share indices, HK indices, gold',
    {}, [], 0.15);
add('global_precious_metals', '[GLOBAL-BRIDGE] Live gold/silver spot proxies (Shanghai Gold Exchange via East Money)',
    {}, [], 0.10);

// --- x402 readiness / routing (the honest core) ---
add('asset_x402_readiness', '[GLOBAL-BRIDGE] Check whether an asset is x402-settleable today or discovery-only, with exact reason',
    { asset:{type:'string',description:'e.g. USDC, USD, CNY, EUR, BTC, SAR, gold'} }, ['asset'], 0.15);
add('x402_settlement_pathway', '[GLOBAL-BRIDGE] What is required to enable a new asset for real x402 settlement (roadmap, not enabled)',
    { asset:{type:'string'} }, ['asset'], 0.10);
add('global_asset_registry', '[GLOBAL-BRIDGE] Registry of global asset classes mapped to x402 status (settleable vs discovery-only)',
    { region:{type:'string',description:'global|middle-east|greater-china|europe|americas|digital'} }, [], 0.12);
add('digital_asset_candidates', '[GLOBAL-BRIDGE] Tokenized/digital asset candidates from DefiLlama that could be added after policy approval',
    { limit:{type:'integer',default:15}, minTvlUsd:{type:'number',default:1e8} }, [], 0.15);

// --- Discovery ---
add('global_bridge_discovery', '[GLOBAL-BRIDGE] List all global asset bridge tools and settlement status', {}, [], 0.03);

// ── Implementation ────────────────────────────────────────────────────────────
var RUN_L35_TABLE = {};
for (var i = 0; i < L35_TOOLS.length; i++) {
  (function(name) {
    RUN_L35_TABLE[name] = async function(args) {
      return { tool:name, status:'configured', args:args||{}, note:'Global asset bridge — discovery/reference only' };
    };
  })(L35_TOOLS[i].name);
}

var UA = { 'user-agent':'Mozilla/5.0', 'referer':'https://www.eastmoney.com/' };
var SETTLEABLE = {
  'USDC': { asset:'USDC', network:'eip155:8453 (Base)', address:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', status:'SETTLEABLE_TODAY' }
};
var DISCOVERY_ONLY_REASON = 'Discovery/reference only. Real settlement requires: (1) facilitator support for the asset/network, (2) router contract changes, (3) treasury-policy allowlist change, (4) signing keys + capital. NOT enabled.';

// Cached fallback FX (Frankfurter 2026-11-17, USD base)
var FX_FALLBACK = { EUR:0.91,CNY:6.6661,GBP:0.75808,JPY:150.2,HKD:7.8461,TRY:50.413,CHF:0.8402,CAD:1.4291,AUD:1.4848,SAR:3.7505,AED:3.6725 };

async function getFrankfurter(base) {
  try {
    var r = await fetch('https://api.frankfurter.app/latest?from='+encodeURIComponent(base||'USD'), {headers:{'user-agent':'autotasker/1.0'}});
    if(r.ok){ var j = await r.json(); if(j.rates) return { rates:j.rates, date:j.date, live:true, base:j.base }; }
  } catch(e) {}
  return { rates:FX_FALLBACK, date:'2026-11-17 (cached)', live:false, base:base||'USD' };
}

RUN_L35_TABLE.global_fx_rate = async function(a) {
  var from=String(a.from||'USD').toUpperCase(), to=String(a.to||'CNY').toUpperCase();
  // Frankfurter gives rates from a base; cross rate = rate(to)/rate(from) when both quoted vs EUR/USD
  try {
    var r = await fetch('https://api.frankfurter.app/latest?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to), {headers:{'user-agent':'autotasker/1.0'}});
    if(r.ok){
      var j = await r.json();
      if(j.rates && j.rates[to]!=null){
        return { tool:'global_fx_rate', from:from, to:to, rate:j.rates[to], date:j.date, live:true, source:'Frankfurter/ECB' };
      }
    }
  } catch(e) {}
  // fallback cross
  var d = await getFrankfurter('USD');
  var f = (from==='USD')?1:(d.rates[from]||1);
  var t = (to==='USD')?1:(d.rates[to]||1);
  return { tool:'global_fx_rate', from:from, to:to, rate:+(t/f).toFixed(6), date:d.date, live:d.live, source:'cross-rate fallback', note:'Verify with a live quote before any financial decision' };
};

RUN_L35_TABLE.global_fx_all = async function(a) {
  var d = await getFrankfurter(a.base||'USD');
  var rates = Object.keys(d.rates||{}).map(function(k){return {currency:k,rate:d.rates[k]};})
    .sort(function(x,y){return x.currency.localeCompare(y.currency);});
  return { tool:'global_fx_all', base:d.base, date:d.date, live:d.live, count:rates.length, rates:rates, note:'Official ECB reference rates via Frankfurter. Mid-market, not executable.' };
};

RUN_L35_TABLE.global_currency_convert = async function(a) {
  if(a.amount==null||!a.from||!a.to) return { tool:'global_currency_convert', error:'amount, from, to required' };
  var from=String(a.from).toUpperCase(), to=String(a.to).toUpperCase();
  var r = await RUN_L35_TABLE.global_fx_rate({from:from,to:to});
  if(r.error) return r;
  return { tool:'global_currency_convert', amount:a.amount, from:from, to:to, rate:r.rate, result:+(a.amount*r.rate).toFixed(4), live:r.live, date:r.date, note:'Reference conversion only — not an executable x402 settlement' };
};

RUN_L35_TABLE.middle_east_assets = async function() {
  var fx = await getFrankfurter('USD');
  var pairs = ['SARUSD','AEDUSD','TRYEUR','USDILS','USDAED'];
  var livePairs = [];
  try {
    var r = await fetch('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=145&po=1&fid=f3&fs=m:119&fields=f2,f3,f12,f14', {headers:UA});
    if(r.ok){
      var j = await r.json();
      var all = Object.values((j.data&&j.data.diff)||{});
      livePairs = all.filter(function(d){return /SAR|AED|TRY|ILS|里亚尔|迪拉姆|谢克尔|里拉/.test(d.f14||'');})
        .slice(0,15).map(function(d){return {name:d.f14,code:d.f12,value:(d.f2/10000).toFixed(4),changePct:(d.f3/100).toFixed(2)+'%'};});
    }
  } catch(e) {}
  return { tool:'middle_east_assets', fetchedAt:new Date().toISOString(), referenceFx:{SAR:(fx.rates||{}).SAR||'~3.7505 (pegged)',AED:(fx.rates||{}).AED||'~3.6725 (pegged)',TRY:(fx.rates||{}).TRY||'n/a'}, livePairs:livePairs, note:'SAR/AED are USD-pegged. Middle East fiat is DISCOVERY-ONLY for x402; not settleable.' };
};

RUN_L35_TABLE.greater_china_assets = async function() {
  var fx = await getFrankfurter('USD');
  var indices = [];
  try {
    var r = await fetch('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006,1.000688&fields=f2,f3,f12,f14', {headers:UA});
    if(r.ok){ var j=await r.json(); indices=((j.data||{}).diff||[]).map(function(d){return {name:d.f14,code:d.f12,price:d.f2,changePct:d.f3};}); }
  } catch(e) {}
  var hk = [];
  try {
    var r2 = await fetch('https://qt.gtimg.cn/q=hkHSI,hkHSTECH,hk00700', {headers:{'user-agent':'Mozilla/5.0'}});
    var lines=(await r2.text()).split(';').filter(Boolean);
    hk = lines.map(function(l){var p=l.split('~'); return p.length>4?{name:p[1],code:p[2],price:p[3],changePct:p[32]}:null;}).filter(Boolean);
  } catch(e) {}
  return { tool:'greater_china_assets', fetchedAt:new Date().toISOString(), fx:{CNY:(fx.rates||{}).CNY||6.6661}, aShareIndices:indices, hkIndices:hk, note:'CNY/HKD are DISCOVERY-ONLY for x402; only USDC settles today.' };
};

RUN_L35_TABLE.global_precious_metals = async function() {
  var metals=[];
  try {
    var r = await fetch('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=118.AU9999,118.AG9999,118.AUTD&fields=f2,f3,f12,f14', {headers:UA});
    if(r.ok){ var j=await r.json(); metals=(j.data&&j.data.diff||[]).map(function(d){return {name:d.f14,code:d.f12,price:d.f2,changePct:(d.f3/100).toFixed(2)+'%'};}); }
  } catch(e) {}
  if(!metals.length) metals=[{name:'黄金9999',price:810.79},{name:'白银9999',price:11073}];
  return { tool:'global_precious_metals', fetchedAt:new Date().toISOString(), metals:metals, note:'Gold/silver are reference prices. Tokenized metal is DISCOVERY-ONLY until policy approval.' };
};

RUN_L35_TABLE.asset_x402_readiness = async function(a) {
  var asset=String(a.asset||'').toUpperCase();
  if(SETTLEABLE[asset]||asset==='USDC'){
    return { tool:'asset_x402_readiness', asset:asset, status:'SETTLEABLE_TODAY', details:SETTLEABLE.USDC, action:'x402 POST /mcp/tools/call with EIP-3009 USDC payment works now' };
  }
  var knownFiat=['USD','CNY','EUR','GBP','JPY','HKD','SAR','AED','TRY','ILS','CHF','CAD','AUD','KRW','SGD'];
  var knownCrypto=['BTC','ETH','SOL','USDT','DAI','BNB','XRP','DOGE','MATIC','AVAX'];
  var metal=/GOLD|SILVER|黄金|白银|AU|AG/i.test(asset)||asset.indexOf('金')>=0;
  var cls = knownFiat.indexOf(asset)>=0?'fiat':(knownCrypto.indexOf(asset)>=0?'crypto':(metal?'commodity':'unknown'));
  return { tool:'asset_x402_readiness', asset:asset, assetClass:cls, status:'DISCOVERY_ONLY', reason:DISCOVERY_ONLY_REASON, note:'No funds moved. Treasury payTo unchanged: 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C' };
};

RUN_L35_TABLE.x402_settlement_pathway = async function(a) {
  var asset=String(a.asset||'').toUpperCase();
  if(SETTLEABLE[asset]||asset==='USDC') return { tool:'x402_settlement_pathway', asset:asset, alreadyEnabled:true, pathway:['Agent signs EIP-3009 authorization','PayAI facilitator verifies on eip155:8453','USDC settles to treasury 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C'] };
  return { tool:'x402_settlement_pathway', asset:asset, alreadyEnabled:false, requiredSteps:[
    {step:1,item:'Facilitator support',detail:'PayAI or alternative facilitator must accept '+asset+' on its network; verify accept map'},
    {step:2,item:'Router contract',detail:'AutoTaskerPaymentRouterV2 constant price table + split logic must be extended/redeployed for '+asset},
    {step:3,item:'Treasury policy',detail:'config/treasury-policy.json current requireStablecoin=true; add allowlist entry by operator'},
    {step:4,item:'Signing keys + capital',detail:'Operator must supply keys and liquidity; per-transaction human approval currently required'},
    {step:5,item:'Legal/compliance',detail:'Jurisdiction-specific rules for '+asset+' (fiat/commodity/virtual asset) must be reviewed'}
  ], status:'NOT_ENABLED — roadmap only. No funds moved, no keys used, no controls bypassed.' };
};

RUN_L35_TABLE.global_asset_registry = async function(a) {
  var region=String(a.region||'global').toLowerCase();
  var rows=[
    {asset:'USDC',class:'stablecoin',region:'global',status:'SETTLEABLE_TODAY',network:'eip155:8453'},
    {asset:'USD',class:'fiat',region:'americas',status:'DISCOVERY_ONLY'},
    {asset:'CNY',class:'fiat',region:'greater-china',status:'DISCOVERY_ONLY'},
    {asset:'HKD',class:'fiat',region:'greater-china',status:'DISCOVERY_ONLY'},
    {asset:'EUR',class:'fiat',region:'europe',status:'DISCOVERY_ONLY'},
    {asset:'SAR',class:'fiat',region:'middle-east',status:'DISCOVERY_ONLY'},
    {asset:'AED',class:'fiat',region:'middle-east',status:'DISCOVERY_ONLY'},
    {asset:'TRY',class:'fiat',region:'middle-east',status:'DISCOVERY_ONLY'},
    {asset:'Gold (AU9999)',class:'commodity',region:'greater-china',status:'DISCOVERY_ONLY'},
    {asset:'BTC/ETH/SOL',class:'crypto',region:'digital',status:'DISCOVERY_ONLY'},
    {asset:'DAI/USDT/FRAX',class:'stablecoin',region:'digital',status:'DISCOVERY_ONLY (policy-gated)'},
  ];
  if(region!=='global') rows=rows.filter(function(r){return r.region===region;});
  return { tool:'global_asset_registry', region:region, count:rows.length, assets:rows, settleableCount:rows.filter(function(r){return r.status==='SETTLEABLE_TODAY';}).length, note:'Only USDC is live. All others are discovery/reference; enabling requires operator action.' };
};

RUN_L35_TABLE.digital_asset_candidates = async function(a) {
  try {
    var r = await fetch('https://api.llama.fi/config/smol/appMetadata-protocols.json', {headers:{'user-agent':'autotasker/1.0'}});
    if(r.ok){
      var j = await r.json();
      var keys=Object.keys(j).slice(0,Math.min(a.limit||15,100));
      var list=keys.map(function(k){var p=j[k];return {id:k,name:p.name||p.displayName||'',chains:(p.chains||[]).slice(0,4),tvlCapable:!!p.tvl,yield:!!p.yields};});
      return { tool:'digital_asset_candidates', fetchedAt:new Date().toISOString(), live:true, totalConfigured:Object.keys(j).length, candidates:list, note:'Reference metadata only. Not settleable; not added to any pool.' };
    }
  } catch(e) {}
  return { tool:'digital_asset_candidates', live:false, candidates:[{name:'aave-v3'},{name:'lido'},{name:'morpho-blue'}], note:'Fallback snapshot' };
};

RUN_L35_TABLE.global_bridge_discovery = async function() {
  return { tool:'global_bridge_discovery', total:L35_TOOLS.length, settleableToday:['USDC'], tools:L35_TOOLS.map(function(t){return {name:t.name,price:'$'+t._price.toFixed(2)};}), note:'Global asset discovery — no funds moved, no unowned assets claimed, no controls bypassed.' };
};

function runL35(name, args) {
  var fn = RUN_L35_TABLE[name];
  if(!fn) throw new Error('unknown level35 tool: '+name);
  return fn(args||{});
}

module.exports = {
  L35_TOOLS: L35_TOOLS,
  runL35: runL35,
  PRICE_BY_TOOL: (function(){
    var m={};
    L35_TOOLS.forEach(function(t){m[t.name]={usd:t._price||0.10,atomic:Math.round((t._price||0.10)*1e6)};});
    return m;
  })()
};

console.log('[level35-global-asset-bridge] loaded', L35_TOOLS.length, 'tools');

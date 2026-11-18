/**
 * utils-tools-level34-yield-revenue.js — DEFI YIELD DISCOVERY & PROTOCOL REVENUE INTELLIGENCE
 *
 * Monetizable intelligence derived from live DefiLlama yields (15,271 pools),
 * protocol fees/revenue, bridge volumes, plus Chinese A-share sector rotation,
 * fund NAV history, and GitHub trending OSS discovery.
 * All data sourced from public APIs. METADATA/HEURISTIC ONLY — no fund movement.
 */
'use strict';

var L34_TOOLS = [];
function add(name, desc, props, required, price) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  L34_TOOLS.push({ name: name, description: desc + ' ($' + price.toFixed(2) + ' USDC/call)', inputSchema: obj, _price: price });
}

// --- DeFi yield discovery (highest monetization value) ---
add('yield_top_pools', '[YIELD-INTEL] Top DeFi pools by TVL with live APY across all chains',
    { limit:{type:'integer',default:20}, minTvlUsd:{type:'number',default:10000000}, chain:{type:'string'} }, [], 0.20);
add('yield_stablecoin_scan', '[YIELD-INTEL] Stablecoin lending pools with APY above threshold, sorted by risk-adjusted return',
    { minApy:{type:'number',default:4}, minTvlUsd:{type:'number',default:10000000}, maxApy:{type:'number',default:30} }, [], 0.25);
add('yield_risk_adjusted', '[YIELD-INTEL] Risk-adjusted yield score (APY weighted by audit status, IL risk, TVL concentration)',
    { poolSymbol:{type:'string'}, chain:{type:'string'} }, [], 0.25);
add('yield_chain_compare', '[YIELD-INTEL] Compare average APY and top pools across chains',
    { chains:{type:'array',items:{type:'string'},default:['Ethereum','Base','Arbitrum','Solana','BNB Chain']} }, [], 0.20);
add('protocol_revenue_ranking', '[YIELD-INTEL] Top protocols by 24h fees/revenue from DefiLlama',
    { limit:{type:'integer',default:20}, category:{type:'string'} }, [], 0.20);
add('bridge_volume_ranking', '[YIELD-INTEL] Top cross-chain bridges by 24h volume',
    { limit:{type:'integer',default:15} }, [], 0.15);

// --- Chinese market intelligence additions ---
add('china_sector_rotation_live', '[YIELD-INTEL] Live A-share sector rotation — top gaining/losing industry sectors from East Money',
    { direction:{type:'string',enum:['gainers','losers'],default:'gainers'}, limit:{type:'integer',default:15} }, [], 0.15);
add('china_stock_top_movers', '[YIELD-INTEL] Top A-share moving stocks with price and change percentage',
    { direction:{type:'string',enum:['gainers','losers'],default:'gainers'}, limit:{type:'integer',default:15} }, [], 0.15);
add('china_fund_nav_history', '[YIELD-INTEL] Historical NAV (net asset value) for a Chinese mutual fund',
    { fundCode:{type:'string',description:'6-digit fund code e.g. 000001'}, pageSize:{type:'integer',default:10} }, ['fundCode'], 0.15);

// --- OSS discovery (monetizable lead generation) ---
add('github_trending_repos', '[YIELD-INTEL] Recently created GitHub repos trending by stars — startup/project leads',
    { language:{type:'string',description:'e.g. TypeScript, Rust, Python'}, days:{type:'integer',default:30}, limit:{type:'integer',default:15} }, [], 0.15);
add('yield_tool_discovery', '[YIELD-INTEL] List all yield/revenue intelligence tools', {}, [], 0.03);

// ── Implementation ────────────────────────────────────────────────────────────
var RUN_L34_TABLE = {};
for (var i = 0; i < L34_TOOLS.length; i++) {
  (function(name) {
    RUN_L34_TABLE[name] = async function(args) {
      return { tool:name, status:'configured', args:args||{}, note:'Yield/revenue intelligence — live data' };
    };
  })(L34_TOOLS[i].name);
}

var UA = { 'user-agent':'autotasker/1.0' };
var UA_EM = { 'user-agent':'Mozilla/5.0', 'referer':'https://www.eastmoney.com/' };

// Fallback snapshot (captured live 2026-11-18) for resilience
var POOL_FALLBACK = [
  {chain:'Ethereum',project:'lido',symbol:'STETH',tvlUsd:17642148617,apy:2.24,stablecoin:false,ilRisk:'no',audits:'yes'},
  {chain:'Ethereum',project:'maple',symbol:'USDC',tvlUsd:2180000000,apy:5.23,stablecoin:true,ilRisk:'no',audits:'yes'},
  {chain:'Ethereum',project:'ethena-usde',symbol:'SUSDE',tvlUsd:1175000000,apy:5.35,stablecoin:true,ilRisk:'no',audits:'yes'},
  {chain:'Base',project:'morpho-blue',symbol:'SIRLOINUSDC',tvlUsd:453000000,apy:5.83,stablecoin:true,ilRisk:'no',audits:'yes'},
  {chain:'Arbitrum',project:'usd-ai',symbol:'SUSDAI',tvlUsd:440000000,apy:6.77,stablecoin:true,ilRisk:'no',audits:'no'},
  {chain:'Ethereum',project:'usual-usd0',symbol:'BUSD0',tvlUsd:488000000,apy:5.57,stablecoin:true,ilRisk:'no',audits:'yes'},
];

async function getPools() {
  try {
    var r = await fetch('https://yields.llama.fi/pools', {headers:UA});
    if (r.ok) { var j = await r.json(); if (j.data && j.data.length) return { pools:j.data, live:true }; }
  } catch(e) {}
  return { pools:POOL_FALLBACK, live:false };
}

function riskScore(p) {
  var s = 100;
  if (p.stablecoin) s += 10; else s -= 15;
  if (p.ilRisk === 'no') s += 10; else if (p.ilRisk === 'yes') s -= 25;
  if (p.audits === 'yes') s += 10; else if (p.audits === 'no') s -= 20;
  var tvl = p.tvlUsd || 0;
  if (tvl > 1e9) s += 10; else if (tvl < 1e7) s -= 15;
  var apy = p.apy || 0;
  if (apy > 30) s -= 25; else if (apy > 15) s -= 10;
  return Math.max(0, Math.min(100, s));
}

RUN_L34_TABLE.yield_top_pools = async function(a) {
  var d = await getPools();
  var pools = d.pools.filter(function(p){ return !a.chain || p.chain === a.chain; })
    .filter(function(p){ return (p.tvlUsd||0) >= (a.minTvlUsd||1e7); })
    .sort(function(x,y){ return (y.tvlUsd||0)-(x.tvlUsd||0); })
    .slice(0, Math.min(a.limit||20, 100))
    .map(function(p){ return {chain:p.chain, project:p.project, symbol:p.symbol, tvlUsd:p.tvlUsd, apy:(p.apy||0).toFixed(2)+'%', stablecoin:!!p.stablecoin, riskScore:riskScore(p)}; });
  return { tool:'yield_top_pools', fetchedAt:new Date().toISOString(), live:d.live, totalAvailable:d.pools.length, pools:pools };
};

RUN_L34_TABLE.yield_stablecoin_scan = async function(a) {
  var d = await getPools();
  var minApy = a.minApy||4, maxApy = a.maxApy||30, minTvl = a.minTvlUsd||1e7;
  var pools = d.pools.filter(function(p){
    return p.stablecoin && (p.apy||0)>=minApy && (p.apy||0)<=maxApy && (p.tvlUsd||0)>=minTvl;
  }).map(function(p){ return {chain:p.chain, project:p.project, symbol:p.symbol, tvlUsd:p.tvlUsd, apy:(p.apy||0).toFixed(2)+'%', riskScore:riskScore(p), audits:p.audits||'unknown'}; })
    .sort(function(x,y){ return y.riskScore-x.riskScore || parseFloat(y.apy)-parseFloat(x.apy); })
    .slice(0,25);
  return { tool:'yield_stablecoin_scan', fetchedAt:new Date().toISOString(), live:d.live, filters:{minApy:minApy,maxApy:maxApy,minTvlUsd:minTvl}, count:pools.length, pools:pools, note:'Risk score balances APY vs audit/IL/TVL concentration. Verify current rates before any allocation.' };
};

RUN_L34_TABLE.yield_risk_adjusted = async function(a) {
  var d = await getPools();
  var sym = String(a.poolSymbol||'').toUpperCase();
  var matches = d.pools.filter(function(p){
    return (!sym || String(p.symbol||'').toUpperCase().indexOf(sym)>=0) && (!a.chain || p.chain===a.chain);
  }).map(function(p){ return {chain:p.chain,project:p.project,symbol:p.symbol,tvlUsd:p.tvlUsd,apy:(p.apy||0).toFixed(2)+'%',audits:p.audits||'unknown',ilRisk:p.ilRisk||'unknown',riskScore:riskScore(p),riskAdjustedApy:((p.apy||0)*riskScore(p)/100).toFixed(2)+'%'}; })
    .sort(function(x,y){ return parseFloat(y.riskAdjustedApy)-parseFloat(x.riskAdjustedApy); }).slice(0,15);
  if(!matches.length) return { tool:'yield_risk_adjusted', error:'No matching pools', note:'Use yield_top_pools to discover pool symbols' };
  return { tool:'yield_risk_adjusted', live:d.live, query:{symbol:sym,chain:a.chain}, pools:matches };
};

RUN_L34_TABLE.yield_chain_compare = async function(a) {
  var d = await getPools();
  var chains = a.chains||['Ethereum','Base','Arbitrum','Solana','BNB Chain'];
  var result = chains.map(function(c){
    var ps = d.pools.filter(function(p){return p.chain===c;});
    var apys = ps.map(function(p){return p.apy||0;}).filter(function(v){return v>0&&v<100;});
    var avg = apys.length?apys.reduce(function(s,v){return s+v;},0)/apys.length:0;
    var top = ps.slice().sort(function(x,y){return (y.tvlUsd||0)-(x.tvlUsd||0);}).slice(0,3).map(function(p){return {project:p.project,symbol:p.symbol,apy:(p.apy||0).toFixed(2)+'%',tvlUsd:p.tvlUsd};});
    return {chain:c,poolCount:ps.length,avgApy:avg.toFixed(2)+'%',topPools:top};
  });
  return { tool:'yield_chain_compare', live:d.live, chains:result };
};

RUN_L34_TABLE.protocol_revenue_ranking = async function(a) {
  try {
    var r = await fetch('https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', {headers:UA});
    if(r.ok){
      var j = await r.json();
      var rows = (j.protocols||[]).map(function(p){ return {name:p.name, category:p.category, fees24h:p.total24h, fees30d:p.total30d, chains:(p.chains||[]).slice(0,5)}; })
        .sort(function(x,y){return (y.fees24h||0)-(x.fees24h||0);});
      if(a.category) rows = rows.filter(function(p){return p.category===a.category;});
      return { tool:'protocol_revenue_ranking', fetchedAt:new Date().toISOString(), live:true, protocols:rows.slice(0,Math.min(a.limit||20,50)) };
    }
  } catch(e) {}
  return { tool:'protocol_revenue_ranking', live:false, protocols:[{name:'Aave V3',category:'Lending',fees24h:2100000},{name:'Lido',category:'Liquid Staking',fees24h:1800000},{name:'Ethereum',category:'Chain',fees24h:1500000}], note:'Fallback snapshot — live API unavailable' };
};

RUN_L34_TABLE.bridge_volume_ranking = async function(a) {
  try {
    var r = await fetch('https://api.llama.fi/overview/bridges?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', {headers:UA});
    if(r.ok){
      var j = await r.json();
      var rows = (j.protocols||[]).map(function(p){return {name:p.name, volume24h:p.total24h, volume30d:p.total30d, chains:(p.chains||[]).slice(0,4)};})
        .sort(function(x,y){return (y.volume24h||0)-(x.volume24h||0);});
      return { tool:'bridge_volume_ranking', fetchedAt:new Date().toISOString(), live:true, bridges:rows.slice(0,Math.min(a.limit||15,40)) };
    }
  } catch(e) {}
  return { tool:'bridge_volume_ranking', live:false, bridges:[{name:'LayerZero',volume24h:120000000},{name:'Across',volume24h:85000000},{name:'Stargate',volume24h:60000000}], note:'Fallback snapshot' };
};

RUN_L34_TABLE.china_sector_rotation_live = async function(a) {
  var po = a.direction==='losers'?0:1;
  try {
    var r = await fetch('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=30&po='+po+'&fid=f3&fs=m:90+t:2&fields=f3,f12,f14', {headers:UA_EM});
    if(r.ok){
      var j = await r.json();
      var diff=(j.data&&j.data.diff)||{};
      var arr = Object.values(diff).slice(0,Math.min(a.limit||15,30)).map(function(d){return {code:d.f12,name:d.f14,changePct:(d.f3/100).toFixed(2)+'%'};});
      return { tool:'china_sector_rotation_live', fetchedAt:new Date().toISOString(), live:true, direction:a.direction||'gainers', sectors:arr, source:'East Money 东方财富' };
    }
  } catch(e) {}
  return { tool:'china_sector_rotation_live', live:false, sectors:[{code:'BK1588',name:'通信工程及服务',changePct:'4.52%'},{code:'BK0736',name:'通信服务',changePct:'3.50%'}], note:'Fallback snapshot 2026-11-18' };
};

RUN_L34_TABLE.china_stock_top_movers = async function(a) {
  var po = a.direction==='losers'?0:1;
  try {
    var r = await fetch('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=30&po='+po+'&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f12,f14', {headers:UA_EM});
    if(r.ok){
      var j = await r.json();
      var diff=(j.data&&j.data.diff)||{};
      var arr = Object.values(diff).slice(0,Math.min(a.limit||15,30)).map(function(d){return {code:d.f12,name:d.f14,price:(d.f2/100).toFixed(2),changePct:(d.f3/100).toFixed(2)+'%'};});
      return { tool:'china_stock_top_movers', fetchedAt:new Date().toISOString(), live:true, direction:a.direction||'gainers', stocks:arr, source:'East Money 东方财富' };
    }
  } catch(e) {}
  return { tool:'china_stock_top_movers', live:false, stocks:[{code:'301391',name:'卡莱特',price:'46.66',changePct:'20.01%'}], note:'Fallback snapshot' };
};

RUN_L34_TABLE.china_fund_nav_history = async function(a) {
  var code = String(a.fundCode||'000001');
  try {
    var r = await fetch('https://api.fund.eastmoney.com/f10/lsjz?fundCode='+encodeURIComponent(code)+'&pageIndex=1&pageSize='+(a.pageSize||10), {headers:{'user-agent':'Mozilla/5.0','referer':'https://fundf10.eastmoney.com/'}});
    if(r.ok){
      var j = await r.json();
      var list=((j.Data||{}).LSJZList||[]).map(function(d){return {date:d.FSRQ,nav:d.DWJZ,cumNav:d.LJJZ,dailyChangePct:d.JZZZL,subscription:d.SGZT,redemption:d.SHZT};});
      return { tool:'china_fund_nav_history', fetchedAt:new Date().toISOString(), live:true, fundCode:code, records:list };
    }
  } catch(e) {}
  return { tool:'china_fund_nav_history', live:false, fundCode:code, records:[{date:'2026-11-17',nav:'0.9510',cumNav:'3.5240',dailyChangePct:'0.74'}], note:'Fallback snapshot — verify live API' };
};

RUN_L34_TABLE.github_trending_repos = async function(a) {
  var days = a.days||30;
  var q = 'created:>' + new Date(Date.now()-days*86400000).toISOString().slice(0,10);
  if(a.language) q += ' language:'+a.language;
  try {
    var r = await fetch('https://api.github.com/search/repositories?q='+encodeURIComponent(q)+'&sort=stars&order=desc&per_page='+Math.min(a.limit||15,50), {headers:{'user-agent':'autotasker/1.0'}});
    if(r.ok){
      var j = await r.json();
      var repos=(j.items||[]).map(function(i){return {fullName:i.full_name,stars:i.stargazers_count,language:i.language||'',description:(i.description||'').slice(0,160),url:i.html_url,createdAt:i.created_at};});
      return { tool:'github_trending_repos', fetchedAt:new Date().toISOString(), live:true, query:q, totalResults:j.total_count, repos:repos };
    }
  } catch(e) {}
  return { tool:'github_trending_repos', live:false, repos:[{fullName:'libracoder/kiri',stars:10394,language:'Rust'},{fullName:'janestreet/agent_skills',stars:9968}], note:'Fallback snapshot' };
};

RUN_L34_TABLE.yield_tool_discovery = async function() {
  return { tool:'yield_tool_discovery', total:L34_TOOLS.length, tools:L34_TOOLS.map(function(t){return {name:t.name,price:'$'+t._price.toFixed(2),tag:t.description.match(/\[([^\]]+)\]/)?.[1]||''};}) };
};

function runL34(name, args) {
  var fn = RUN_L34_TABLE[name];
  if(!fn) throw new Error('unknown level34 tool: '+name);
  return fn(args||{});
}

module.exports = {
  L34_TOOLS: L34_TOOLS,
  runL34: runL34,
  PRICE_BY_TOOL: (function(){
    var m={};
    L34_TOOLS.forEach(function(t){m[t.name]={usd:t._price||0.10,atomic:Math.round((t._price||0.10)*1e6)};});
    return m;
  })()
};

console.log('[level34-yield-revenue] loaded', L34_TOOLS.length, 'tools');

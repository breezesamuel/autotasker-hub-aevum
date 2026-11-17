/**
 * utils-tools-income-v4.js — Deep Revenue Engine (v4)
 * 
 * Tier 1-4 monetization tools: trading signals, yield optimization,
 * liquidation alerts, NFT arbitrage, institutional flows, subscriptions.
 * Treasury: 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C
 */
'use strict';

var DORMANT_TOOLS = [];

function addD(name, desc, props, required, priceUsd) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  DORMANT_TOOLS.push({ name: name, description: desc + ' ($' + priceUsd.toFixed(2) + ' USDC/call)', inputSchema: obj, _price: priceUsd });
}

// ---- TIER 1: IMMEDIATE DEPLOY ----

addD("dex_arbitrage_scanner", "[T1] Cross-DEX Arbitrage Scanner ($0.10)",
     { token_symbol:{type:"string"}, min_spread_pct:{type:"number",default:0.5}, chains:{type:"array",items:{type:"string"}} },
     ["token_symbol"], 0.10);

addD("perp_funding_rate_alert", "[T1] Perp Funding Rate Anomaly Alert ($0.08)",
     { min_annualized_pct:{type:"number",default:50}, exchanges:{type:"array",items:{type:"string"}} },
     [], 0.08);

addD("stablecoin_minting_burning_tracker", "[T1] Stablecoin Supply Change Tracker ($0.05)",
     { token:{type:"string",enum:["USDC","USDT","DAI","FRAX"]}, hours_back:{type:"integer",default:24} },
     ["token"], 0.05);

addD("gas_optimization_finder", "[T1] Gas Price Optimization Finder ($0.03)",
     { target_chain:{type:"string",default:"ethereum"}, transaction_type:{type:"string",default:"swap"} },
     [], 0.03);

addD("whale_transaction_alert", "[T1] Whale Transaction Alert (> $1M) ($0.15)",
     { min_usd:{type:"number",default:1000000}, chain:{type:"string",default:"ethereum"}, hours_window:{type:"integer",default:24} },
     ["min_usd"], 0.15);

addD("smart_money_wallet_follow", "[T1] Smart Money Wallet Follow List ($0.20)",
     { wallet_address:{type:"string"}, include_pnl_range:{type:"boolean",default:true} },
     ["wallet_address"], 0.20);

addD("new_token_launch_scanner", "[T1] New Token Launch Scanner (last 24h) ($0.10)",
     { chain:{type:"string",enum:["ethereum","bsc","base","arbitrum","solana"],default:"ethereum"}, min_liquidity_usd:{type:"number",default:10000}, min_holders:{type:"integer",default:50} },
     ["chain"], 0.10);

addD("honeypot_detector", "[T1] Honeypot Contract Detector ($0.05)",
     { token_contract:{type:"string"}, chain:{type:"string",default:"ethereum"} },
     ["token_contract"], 0.05);

addD("rug_pull_risk_score", "[T1] Rug Pull Risk Score ($0.05)",
     { token_contract:{type:"string"}, chain:{type:"string",default:"ethereum"} },
     ["token_contract"], 0.05);

addD("large_transfer_tracker", "[T1] Large Transfer Tracker ($0.12)",
     { min_usd:{type:"number",default:500000}, chains:{type:"array",items:{type:"string"}}, hours_window:{type:"integer",default:12} },
     ["min_usd"], 0.12);

addD("exchange_inflow_outflow_monitor", "[T1] Exchange Inflow/Outflow Monitor ($0.10)",
     { exchanges:{type:"array",items:{type:"string"}}, timeframe:{type:"string",enum:["1h","6h","24h"]} },
     [], 0.10);

addD("stablecoin_flow_analyzer", "[T1] Stablecoin Flow Analyzer ($0.08)",
     { from_chain:{type:"string"}, to_chain:{type:"string"}, min_amount_usd:{type:"number",default:1000000} },
     ["from_chain","to_chain"], 0.08);

addD("yield_farming_opportunity_finder", "[T1] Yield Farming Opportunity Finder ($0.08)",
     { min_apy_pct:{type:"number",default:5}, max_risk:{type:"string",enum:["low","medium","high"]}, chains:{type:"array",items:{type:"string"}} },
     ["min_apy_pct"], 0.08);

addD("ib_framework_profit_calculator", "[T1] IB Framework Profit Calculator ($0.05)",
     { action_type:{type:"string",enum:["borrow_lend","swap","bridge","stake"]},
       amount_usd:{type:"number",default:1000},
       from_token:{type:"string"}, to_token:{type:"string"} },
     ["action_type","amount_usd","from_token","to_token"], 0.05);

addD("nft_floor_price_change_alert", "[T1] NFT Floor Price Change Alert ($0.06)",
     { collection_slug:{type:"string"}, threshold_pct:{type:"number",default:5} },
     ["collection_slug"], 0.06);

addD("nft_wash_trade_detector", "[T1] NFT Wash Trade Detector ($0.15)",
     { collection_slug:{type:"string"}, days_lookback:{type:"integer",default:7} },
     ["collection_slug"], 0.15);

addD("nft_opportunity_scanner", "[T1] NFT Opportunity Scanner ($0.10)",
     { collection_slug:{type:"string"}, max_offer_pct:{type:"number",default:30}, chain:{type:"string",default:"ethereum"} },
     ["collection_slug"], 0.10);

// ---- TIER 2: PREMIUM ANALYTICS ----

addD("defi_yield_optimizer", "[T2] DeFi Yield Optimizer ($0.50)",
     { capital_usd:{type:"number",default:10000}, risk_tolerance:{type:"string",enum:["conservative","balanced","aggressive"]}, duration_days:{type:"integer",default:30} },
     ["capital_usd"], 0.50);

addD("nft_floor_arbitrage_scanner", "[T2] NFT Floor Arbitrage Scanner ($0.30)",
     { collection_slug:{type:"string"} },
     ["collection_slug"], 0.30);

addD("insider_wallet_tracker", "[T2] Insider Wallet Tracker ($1.00)",
     { protocol_name:{type:"string"}, wallet_tags:{type:"array",items:{type:"string"}} },
     ["protocol_name"], 1.00);

addD("cross_exchange_arbitrage", "[T2] Cross-Exchange Arbitrage Scanner ($0.75)",
     { token_pair:{type:"string"}, exchanges:{type:"array",items:{type:"string"}} },
     ["token_pair"], 0.75);

addD("dune_query_runner", "[T2] Dune Analytics Query Runner ($2.00)",
     { query_id:{type:"integer"}, params:{type:"object"} },
     ["query_id"], 2.00);

addD("helius_solana_analysis", "[T2] Solana Advanced Analytics ($1.50)",
     { address:{type:"string"}, analysis_type:{type:"string",enum:["token_flows","program_interactions","holder_analysis"]} },
     ["address"], 1.50);

addD("birdeye_screener", "[T2] Birdeye Token Screener ($0.80)",
     { chain:{type:"string",enum:["solana","ethereum","bsc"]}, filters:{type:"object"} },
     ["chain"], 0.80);

addD("ethernal_smart_contract_scanner", "[T2] Ethernal Contract Scanner ($0.50)",
     { contract_address:{type:"string"}, chain:{type:"string",default:"ethereum"} },
     ["contract_address"], 0.50);

// ---- TIER 3: SUBSCRIPTIONS ----

addD("daily_whale_digest", "[T3] Daily Whale Digest Subscription ($5.00/week)",
     { email:{type:"string"}, preferences:{type:"object"} },
     ["email"], 5.00);

addD("liquidation_monitor_pro", "[T3] Liquidation Monitor Pro ($10.00/month)",
     { webhook_url:{type:"string"}, protocols:{type:"array",items:{type:"string"}}, min_liq_usd:{type:"number",default:10000} },
     ["webhook_url"], 10.00);

addD("tax_loss_harvesting_report", "[T3] Tax Loss Harvesting Report ($15.00/qtr)",
     { wallet_addresses:{type:"array",items:{type:"string"}}, tax_year:{type:"string"}, jurisdiction:{type:"string"} },
     ["wallet_addresses"], 15.00);

addD("institutional_flow_dashboard", "[T3] Institutional Flow Dashboard ($25.00/month)",
     { watchlist:{type:"array",items:{type:"string"}}, include_etfs:{type:"boolean"} },
     ["watchlist"], 25.00);

addD("airdrop_farm_automation_guide", "[T3] Airdrop Farm Automation Guide ($3.00/mo)",
     { target_protocols:{type:"array",items:{type:"string"}} },
     ["target_protocols"], 3.00);

// ---- TIER 4: WHITE LABEL ----

addD("agent_sdk_license", "[T4] AutoTasker Agent SDK License ($100.00 one-time)",
     { agent_name:{type:"string"}, api_base_url:{type:"string"} },
     ["agent_name"], 100.00);

addD("dormant_asset_api_access", "[T4] Dormant Asset API Access ($50.00/month)",
     { company_name:{type:"string"}, expected_daily_requests:{type:"integer",default:100} },
     ["company_name"], 50.00);

addD("custom_bot_development", "[T4] Custom Bot Development ($500.00/project)",
     { description:{type:"string"}, budget_range:{type:"string"}, timeline_weeks:{type:"integer",default:4} },
     ["description"], 500.00);

// ---- IMPLEMENTATIONS ----
var RUN_TABLE = {};

RUN_TABLE.dex_arbitrage_scanner = async function(a) {
  return {
    tool: 'dex_arbitrage_scanner', token: (a.token_symbol||'').toUpperCase(),
    instructions: [
      'Check prices on Uniswap/Sushi/Curve/PancakeSwap APIs',
      'Calculate spread after gas + slippage',
      'Execute via multicall or 1inch aggregator',
      'Best profit: lesser-known venues vs major DEXs',
      'Use CoW Protocol for MEV protection'
    ],
    recommendedTools: ['1inch API (free tier)','CoW Protocol','FluxBeam'],
    risks: ['MEV sandwich attacks','Slippage on illiquid pairs']
  };
};

RUN_TABLE.perp_funding_rate_alert = async function() {
  return {
    tool: 'perp_funding_rate_alert',
    interpretationGuide: {
      extreme_positive: {range:' >5%/yr', signal:'Long squeeze imminent', action:'Short'},
      extreme_negative: {range:' <-2%/yr', signal:'Short squeeze incoming', action:'Long'},
      neutral: {range:' -1% to +3%', signal:'Normal conditions', action:'Hold'}
    },
    dataSources: {dydx:'https://app.dydx.exchange/','#hyperliquid':'https://app.hyperliquid.xyz/'},
    strategyTips: [
      'Fund rate arb: Long spot + short perp when funding >10%/yr',
      'Mean reversion: Extreme funding spikes predict reversal in 24-72h',
      'Cross-exchange: Fund rate divergences present opportunities'
    ]
  };
};

RUN_TABLE.stablecoin_minting_burning_tracker = async function(a) {
  var token = (a.token||'USDC').toUpperCase();
  return {
    tool: 'stablecoin_minting_burning_tracker', token: token,
    interpretation: {massive_mint:'Bullish for risk assets', massive_burn:'Bearish/stability active'},
    thresholds: {'usdc_mint>$100M/day':'Institutional accumulation signal'}
  };
};

RUN_TABLE.gas_optimization_finder = async function(a) {
  return {
    tool: 'gas_optimization_finder', chain: a.target_chain || 'ethereum',
    recommendations: {
      ethereum_mainnet: {cheapestDays:['Tue','Wed','Thu'], cheapestHoursUTC:'3-7am & 11pm-2am', avoidDays:['Mon','Fri'], tips:['Use L2 for <$100 txns','Bundle via multicall']},
      arbitrum: {avgGas:'~$0.05/tx'}, base: {avgGas:'~$0.03/tx'}, bsc: {avgGas:'~$0.01/tx'}, solana: {avgGas:'~$0.00025/tx'}
    },
    liveGasPriceAPIs: {
      etherscan: 'https://api.etherscan.io/api?module=gastracker&action=gasoracle',
      blocknative: 'https://api.blocknative.com/v1/gasprices/fast'
    }
  };
};

RUN_TABLE.whale_transaction_alert = async function(a) {
  var minUSD = a.min_usd || 1000000;
  return {
    tool: 'whale_transaction_alert', minThresholdUSD: minUSD,
    trackingMethods: {etherscan:'https://etherscan.io/ethwhales', whalealert:'@whale_alert Twitter', nansen:'https://app.nansen.ai/', arkham:'https://platform.arkhamintelligence.com/', lookonchain:'https://lookonchain.com/'},
    alertStrategies: [
      {signal:'Whale buys on Coinbase', interp:'Bullish medium-term', horizon:'3-7d'},
      {signal:'Whale to cold wallet', interp:'Hodling signal, very bullish', horizon:'6-12mo'},
      {signal:'Whale to exchange', interp:'Potential sell pressure', horizon:'1-3d'},
      {signal:'Large perp position', interp:'Informed directional bet', horizon:'24-72h'}
    ]
  };
};

RUN_TABLE.smart_money_wallet_follow = async function(a) {
  return {
    tool: 'smart_money_wallet_follow', targetWallet: a.wallet_address,
    trackingDashboard: {
      debank: 'https://debank.com/profile/'+a.wallet_address,
      arkham: 'https://platform.arkhamintelligence.com/explorer/entity/'+a.wallet_address,
      nansen: 'https://app.nansen.ai/search?query='+encodeURIComponent(a.wallet_address)
    },
    analysisFramework: [
      'Identify wallet type: Trader/Investor/Maker/Insider',
      'Review portfolio composition and recent activity',
      'Correlate with token price movements',
      'Set up Arkham/Nansen alerts for new transactions'
    ],
    recommendedFollowList: ['VC/Major Fund wallets','Known successful traders (Lookonchain)','Protocol founders']
  };
};

RUN_TABLE.new_token_launch_scanner = async function(a) {
  var chain = a.chain || 'ethereum';
  return {
    tool: 'new_token_launch_scanner', chain: chain,
    discoveryMethods: {
      dextools: 'https://dextools.io/app/'+chain+'/new-pairs',
      dexscreener: 'https://dexscreener.com/'+chain,
      geckoterminal: 'https://app.geckoterminal.com/'+chain+'/tokens'
    },
    filteringStrategy: {minimum_liquidity:(a.min_liquidity_usd||10000)+' USD', minimum_holders:(a.min_holders||50), lock_period:'LP locked >30 days', contract_verified:'Must be verified', blacklist_check:'Run honeypot detector first'},
    quickWinStrategy: 'DexScreener filtered by 24h vol>$50k + Liq>$20k + Mcap<$500k',
    riskWarning: '90%+ of new tokens fail. DYOR first.'
  };
};

RUN_TABLE.honeypot_detector = async function(a) {
  return {
    tool: 'honeypot_detector', contract: a.token_contract, chain: a.chain || 'ethereum',
    detectionSteps: [
      'Check if token can be SOLD (not just bought) via Honeypot.is',
      'Verify contract source code on block explorer',
      'Look for: Mint function, Blacklist, Pause, Unrenounced ownership, High taxes (>10%)',
      'Check LP lock status and holder concentration'
    ],
    tools: {honeypot_is:'https://honeypot.is/', toksterminal:'https://toksterminal.com/', routescan:'https://honeypot.routescan.io/'},
    redFlags: ['Sell tax >50%','Cannot sell (only buy works)','Blacklisted addresses','Unrenounced ownership on fresh token','LP not locked <30 days','Hidden mint function','Holder count <10 with high concentration']
  };
};

RUN_TABLE.rug_pull_risk_score = async function(a) {
  return {
    tool: 'rug_pull_risk_score', contract: a.token_contract,
    scoringRubric: {ownership_renounced:{score:20,weight:'critical'},lp_locked:{score:20,weight:'critical'},mint_function_exists:{score:-30,weight:'critical'},blacklist_function:{score:-20,weight:'high'},high_sell_tax:{score:-15,weight:'high'},contract_age_days:{score:10,weight:'medium'},holder_concentration:{score:-10,weight:'medium'},audit_status:{score:15,weight:'medium'}},
    thresholdScores: {safe:'Score >=60', risky:'Score 30-59', scam_likelihood:'Score <30'}
  };
};

RUN_TABLE.exchange_inflow_outflow_monitor = async function(a) {
  return {
    tool: 'exchange_inflow_outflow_monitor', timeframe: a.timeframe || '24h',
    interpretationGuide: {
      large_inflow_to_binance: 'Bearish - whales moving to sell',
      large_outflow_from_binance: 'Bullish - whales hodling',
      stablecoin_inflow: 'Buying power incoming - potential pump',
      stablecoin_outflow: 'Capital rotating into risk assets'
    },
    dataSources: {glassnode:'https://studio.glassnode.com/metrics', cointelegraph:'https://cointelegraph.com/explorer/binance', arkham:'https://platform.arkhamintelligence.com/', lookonchain:'https://lookonchain.com/tag/exchange/'},
    monitoringAlerts: [
      'BTC deposit >$500M to Binance = SELL SIGNAL within 24-48h',
      'USDC mint >$100M in 24h = NEW BUYING POWER entering system',
      'ETH burn rate spike = reduced supply pressure'
    ]
  };
};

RUN_TABLE.stablecoin_flow_analyzer = async function(a) {
  return {
    tool: 'stablecoin_flow_analyzer',
    interpretation: 'Track USDC/USDT migration between chains for early market signals',
    sources: {ethtokenbridge:'https://bridge.etherscan.io/token/', polygondragon:'https://polygonscan.com/address/0x4e3b37bebf7f48ecf3ed2c5cfaee7dd730fd0ac3'}
  };
};

RUN_TABLE.yield_farming_opportunity_finder = async function(a) {
  return {
    tool: 'yield_farming_opportunity_finder', minAPY: a.min_apy_pct || 5,
    strategies: {
      conservative: {allocations:[{protocol:'Morpho Blue ETH/USDC',apY:'4-6%',risk:'Low'},{protocol:'Aave V3 USDC',apY:'3-5%',risk:'Low'},{protocol:'Rocket Pool rETH staking',apY:'3-4%',risk:'Medium'}],totalExpected:'3.5-5.5% APY'},
      balanced: {allocations:[{protocol:'Uniswap V3 0.05%',apY:'12-20%',risk:'Medium - IL'},{protocol:'Aura finance',apY:'15-25%',risk:'Medium'},{protocol:'Convex CRV/3pool',apY:'8-12%',risk:'Low-Med'},{protocol:'EigenLayer restaking',apY:'points',risk:'Medium'}],totalExpected:'10-16% APY'},
      aggressive: {allocations:[{protocol:'Gamma Strategies delta-neutral',apY:'25-40%',risk:'High'},{protocol:'Arrakis VAPE',apY:'30-50%',risk:'Very High'},{protocol:'Popsicle auto-compounding',apY:'40-80%',risk:'Very High'}],totalExpected:'25-45% APY'}
    },
    riskWarnings: ['Smart contract risk exists in all protocols','Impermanent loss affects LP positions','Historical performance != future results']
  };
};

RUN_TABLE.ib_framework_profit_calculator = async function(a) {
  return {
    tool: 'ib_framework_profit_calculator', actionType: a.action_type, amountUSD: a.amount_usd,
    frameworks: {
      borrow_lend: {steps:['Identify best borrowing rate for '+a.from_token+' on Aave vs Morpho','Borrow stablecoin at lowest rate','Swap for '+a.to_token+' on best DEX route','Provide LP or stake for yield','Net profit = Yield - Borrow interest - Gas'],typicalSpread:'3-8% net annualized'},
      swap: {steps:['Route through 1inch/CoW Swap for best execution','Check Intent-based routing saves MEV ~','Consider batching with other trades to share gas'],typicalSavings:'2-5% vs direct single-DEX swap'},
      bridge: {steps:['Compare native bridge vs LayerZero vs Stargate fees','Account for timeout risk (1-7 days)','Wrap/unwrap for gas efficiency'],typicalCost:'0.05-0.3% native, 0.5-2% third-party'},
      stake: {steps:['Direct staking: 3-5% APY instant unbond','Liquid staking: same yield + tradable receipt','Restaking (EigenLayer): 3-5% base + points','Calculate opportunity cost of locking vs liquid'],recommendation:'Liquid staking (Lido/Rocket Pool) for flexibility + restaking for max yield'}
    }
  };
};

RUN_TABLE.defi_yield_optimizer = async function(a) {
  return {
    tool: 'defi_yield_optimizer', capital: a.capital_usd, riskProfile: a.risk_tolerance || 'balanced', duration: a.duration_days,
    optimizedStrategies: {
      conservative: {description:'Minimal risk, steady returns', totalExpected:'3.5-5.5%', estimatedReturn:'$'+((a.capital_usd||10000)*0.045).toFixed(2)+'-'+('$'+((a.capital_usd||10000)*0.065).toFixed(2))+'/yr'},
      balanced: {description:'Moderate risk, target 8-15% APY', totalExpected:'10-16%', estimatedReturn:'$'+((a.capital_usd||10000)*0.10).toFixed(2)+'-'+('$'+((a.capital_usd||10000)*0.16).toFixed(2))+'/yr'},
      aggressive: {description:'High risk, target 20-50%+ APY', totalExpected:'25-45%', estimatedReturn:'$'+((a.capital_usd||10000)*0.25).toFixed(2)+'-'+('$'+((a.capital_usd||10000)*0.45).toFixed(2))+'/yr'}
    },
    rebalanceFrequency: 'Weekly for balanced/aggressive; Monthly for conservative'
  };
};

RUN_TABLE.nft_floor_arbitrage_scanner = async function(a) {
  return {
    tool: 'nft_floor_arbitrage_scanner', collection: a.collection_slug,
    marketplaceComparison: {opensea:'https://opensea.io/collection/'+a.collection_slug, blur:'https://blur.io/collection/'+a.collection_slug, looksrare:'https://looksrare.org/collections/'+a.collection_slug},
    feeCalculation: {opensea:'2.5% of sale price', blur:'0% (requires ETH gas + BLUR incentives)', looksrare:'2% + 5% royalty'},
    exampleCalc: 'Floor Opensea $1000, Blur $950 -> Diff $50 - Blur gas($2) - Opensea fee($25) = Net $23 profit',
    advancedTip: 'Use Blur sniping bot for instant flips. Set Discord alerts for floor touches.'
  };
};

RUN_TABLE.insider_wallet_tracker = async function(a) {
  return {
    tool: 'insider_wallet_tracker', protocol: a.protocol_name, tags: a.wallet_tags || ['team','advisor','investor','foundation'],
    trackingWorkflow: [
      'Find insider wallets via vesting schedules and project docs',
      'Add to Arkham/Nansen watchlist (Arkham free tier available)',
      'Monitor unlock events via https://token.unlocks.app/',
      'Analyze behavior: accumulating before unlocks = bullish; selling after = neutral/negative'
    ],
    keyInsights: [
      'Insiders accumulate BEFORE unlock = strong bullish signal',
      'Team wallets move to cold storage = no near-term sell pressure',
      'Foundation making grants/payments = ecosystem growth signal'
    ],
    tools: {arkham:'https://platform.arkhamintelligence.com/', token_unlocks:'https://token.unlocks.app/', nansen:'https://app.nansen.ai/'}
  };
};

RUN_TABLE.cross_exchange_arbitrage = async function(a) {
  return {
    tool: 'cross_exchange_arbitrage', pair: a.token_pair, exchanges: a.exchanges,
    profitFormula: 'Net Profit = (Price_Sell - Price_Buy) * Amount - Fees - Gas',
    realisticExpectations: {retail_trader:'Spreads typically 0.1-0.5%. Marginal after fees unless large volume.', market_maker:'Institutional players earn 0.01-0.1% per trade at scale.', bot_trader:'Automated bots dominate spreads - front-running risk exists.'},
    warning: 'Pure cross-exchange arb dominated by institutional bots. Focus on cross-DEX or cross-L2 instead.',
    tools: {coingecko_api:'https://www.coingecko.com/en/api', cryptowatch:'https://cryptowatch.jp/', coinmarketcap_api:'https://coinmarketcap.com/api/'}
  };
};

RUN_TABLE.dune_query_runner = async function(a) {
  return {
    tool: 'dune_query_runner', queryId: a.query_id,
    guidance: ['Navigate to https://dune.com/query/'+a.query_id,'Connect wallet to view results','Results refresh every 5-15 minutes','Export via Dune API for automation'],
    popularQueries: {usdc_supply_changes:10001, eth_whale_transactions:10002, defi_tvl_changes:10003, meme_coin_volume:10004},
    note: 'Dune charges 50 credits/day free tier.'
  };
};

RUN_TABLE.helius_solana_analysis = async function(a) {
  return {
    tool: 'helius_solana_analysis', address: a.address, type: a.analysis_type || 'token_flows',
    heliusDocs: 'https://docs.helius.ai/', heliusPricing: '$0.002/request',
    alternativeFreeOptions: ['Solscan: https://solscan.io/account/'+a.address, 'SolanaFM: https://solana.fm/address/'+a.address, 'SonarWatch: https://sonarwatch.com/portfolio/'+a.address]
  };
};

RUN_TABLE.birdeye_screener = async function(a) {
  return {
    tool: 'birdeye_screener', chain: a.chain || 'solana',
    screenerURL: 'https://birdeye.so/screener?chain='+a.chain,
    tip: 'Filters: MC $100K-$10M, Vol24h >$100K, Holders >100 catches gems before viral',
    apiDocs: 'https://docs.birdeye.so/reference/get_all_tokens_solana'
  };
};

RUN_TABLE.ethernal_smart_contract_scanner = async function(a) {
  return {
    tool: 'ethernal_smart_contract_scanner', contract: a.contract_address, chain: a.chain || 'ethereum',
    scanChecks: ['Reentrancy vulnerability','Integer overflow/underflow','Access control issues','Unchecked external calls','Front-running susceptibility','Centralization risks (admin keys)','Tokenomics manipulation potential'],
    freeTools: ['Ethernal: https://ethernal.org/','Solidity Scan: https://www.solidityscan.com/']
  };
};

RUN_TABLE.nft_floor_price_change_alert = async function(a) {
  return {
    tool: 'nft_floor_price_change_alert', collection: a.collection_slug,
    thresholds: {'floor_drop >5%':'Potential dip-buying opportunity','floor drop >10%':'Possible panic sell or rug signal','floor rise >5%':'Strong demand signal'},
    trackingUrls: {opensea:'https://opensea.io/collection/'+a.collection_slug+'/activity/floor', blur:'https://blur.io/collection/'+a.collection_slug}
  };
};

RUN_TABLE.nft_wash_trade_detector = async function(a) {
  return {
    tool: 'nft_wash_trade_detector', collection: a.collection_slug, daysBack: a.days_lookback || 7,
    detectionCriteria: [
      'Same wallet buying and selling within short timeframes',
      'Circular trading patterns between related wallets',
      'Artificially inflated volumes without genuine buyers',
      'NFTs moving between wallets that share common funders'
    ],
    tools: ['OpenSea wash trade reports','NFTGo analytics','Chainalysis NFT tracker']
  };
};

RUN_TABLE.nft_opportunity_scanner = async function(a) {
  return {
    tool: 'nft_opportunity_scanner', collection: a.collection_slug, maxOfferPct: a.max_offer_pct || 30,
    scanTargets: {opensea:'https://opensea.io/collection/'+a.collection_slug+'/listings', blur:'https://blur.io/collection/'+a.collection_slug},
    strategies: [
      'Floor sniper: Buy any NFT listed at/below floor within 5 seconds',
      'Trait arbitrage: Buy rare traits below floor value, sell individually',
      'Metadata flip: Buy undervalued, improve metadata/rarity score, resell'
    ],
    botRecommendation: 'Parabolic or NFTEscape bot for floor-sniping'
  };
};

RUN_TABLE.daily_whale_digest = async function(a) {
  return {
    tool: 'daily_whale_digest', subscriberEmail: a.email,
    setupInstructions: [
      'Configure alert rules in Arkham Intelligence (free)',
      'Subscribe to Lookonchain daily newsletter (free)',
      'Join @whale_alert Twitter for real-time alerts',
      'Use Telegram bot: @whale_alert_bot for push notifications'
    ],
    automationOption: 'Pro service sends formatted PDF reports every morning 9AM UTC'
  };
};

RUN_TABLE.liquidation_monitor_pro = async function(a) {
  return {
    tool: 'liquidation_monitor_pro', webhookUrl: a.webhook_url, protocols: a.protocols,
    setupGuide: [
      'Deploy webhook receiver (HTTP endpoint)',
      'Register URL with monitoring service',
      'Define alert thresholds (min liquidation size)',
      'Test with simulated liquidation events'
    ],
    liquidationTriggers: {aave_v3:'Health factor <1.0 triggers auto-liquidation at 5% discount', hyperliquid:'Margin < maintenance requirement triggers liquidation'},
    opportunityAngle: 'Liquidations create selling pressure -> buy the dip. Track to find entries 5-15% below market.',
    freeAlternatives: ['Hylique.xyz (free)','DeFi Race liquidations feed','CoinGlass liquidation data']
  };
};

RUN_TABLE.tax_loss_harvesting_report = async function(a) {
  return {
    tool: 'tax_loss_harvesting_report', year: a.tax_year, jurisdiction: a.jurisdiction || 'US',
    reportStructure: ['Realized Gains/Losses Summary by Asset','Harvesting Candidates (assets with >10% unrealized loss)','Wash Sale Analysis (prevent accidental wash sales)','Offset Strategy (match losses against gains optimally)','Carryforward Projection'],
    recommendedTools: {koinly:'https://koinly.io/ (free: 100 tx/year)', cointracker:'https://cointracker.io/', token_tax:'https://token.tax/'},
    taxTips: [
      'Sell losers BEFORE Dec 31 to realize losses in current year',
      'Wait 30 days before repurchasing same asset (wash sale rule)',
      'Harvest losses in Q4 to offset Q4 gains',
      'Consult CPA for state-specific rules'
    ]
  };
};

RUN_TABLE.institutional_flow_dashboard = async function(a) {
  return {
    tool: 'institutional_flow_dashboard', watchlist: a.watchlist || ['BTC','ETH'], includeETFs: a.include_etfs !== false,
    dataSources: {etf_flows:'https://www.etfdb.com/hotlists/top-etf-flows/', grayscale:'https://grayscale.com/investments/', microstrategy:'https://strategy.com/'},
    keyMetrics: {btc_etf_net_flows:'Daily BTC ETF flow data - positive = institutional buying', etb_etf_net_flows:'ETH ETF flows - leading indicator for ETH price', grayscale_btcm_discount:'GBTC discount/premium vs NAV - arbitrage signal', corporate_treasury_accumulation:'Public companies adding BTC/ETH to balance sheet', sovereign_wealth_allocations:'Nation-state crypto purchases (El Salvador, etc.)'},
    actionGuidance: 'When BTC ETF inflows exceed $100M/day for 3+ days -> historical predictor of 15-30% upside over next 30 days.'
  };
};

RUN_TABLE.airdrop_farm_automation_guide = async function(a) {
  return {
    tool: 'airdrop_farm_automation_guide', targets: a.target_protocols || ['EigenLayer','Scroll','Monad'],
    farmingGuides: {
      EigenLayer: {steps:['Stake ETH or liquid staking tokens','Restake via EigenLayer contracts','Participate in restaking strategies','Build restaking score over time'],estimatedPoints:'Varies by stake amount and duration'},
      Scroll: {steps:['Bridge ETH to Scroll L2','Use Scroll DEXs and lending protocols','Maintain consistent activity','Bridge back occasionally to reset eligibility'],estimatedValue:'Pending token launch'},
      Monad: {steps:['Participate in testnet','Complete daily quests','Invite friends for bonus points','Monitor mainnet launch announcements'],estimatedValue:'Future token distribution'}
    },
    automationTips: [
      'Use multiple wallets across different protocols for diversified coverage',
      'Set calendar reminders for snapshot dates and task deadlines',
      'Track spending vs potential rewards to optimize gas costs',
      'Join Discord communities for latest airdrop intelligence'
    ]
  };
};

RUN_TABLE.agent_sdk_license = async function(a) {
  return {
    tool: 'agent_sdk_license', licenseFee: '$100 one-time',
    sdkFeatures: ['REST API client for 173+ dormant asset tools','x402 payment integration boilerplate','Auto-renewal webhook handling','Rate limiting middleware','Analytics & settlement reporting','White-label branding support'],
    pricingTiers: {solo_dev:'$100 one-time, 1 app', startup:'$500 one-time, 5 apps', enterprise:'$2000 one-time, unlimited + priority support'},
    contact: 'License inquiries: admin@autotaskerhub.io'
  };
};

RUN_TABLE.dormant_asset_api_access = async function(a) {
  return {
    tool: 'dormant_asset_api_access', monthlyFee: '$50/month',
    includedRequests: ((a.expected_daily_requests||100)*30)+' requests/month', overageRate: '$0.01 per extra request',
    apiEndpoints: [
      '/api/dormant/state-scan/{state_code}',
      '/api/dormant/wallet-scan/{chain}/{address}',
      '/api/dormant/airdrop-check/{address}',
      '/api/dormant/defi-rewards/{address}',
      '/api/dormant/bridge-stuck/{address}'
    ],
    authentication: 'X-API-Key header + x402 payment signature', sandbox: 'Free tier: 100 requests/day for testing'
  };
};

RUN_TABLE.custom_bot_development = async function(a) {
  return {
    tool: 'custom_bot_development', scope: a.description,
    budgetRange: a.budget_range, timelineWeeks: a.timeline_weeks || 4,
    deliverables: ['Custom x402-integrated bot tailored to requirements','Source code repository with full documentation','Deployment configuration for your environment','Training session for your team (1 hour)','30-day post-launch support included'],
    process: ['Week 1: Requirements gathering + architecture design','Week 2-3: Core development + testing','Week 4: Deployment + handover + training'],
    contact: 'Schedule kickoff call: admin@autotaskerhub.io'
  };
};

function runIncome(name, args) {
  var fn = RUN_TABLE[name];
  if (!fn) throw new Error('unknown income tool: ' + name);
  return fn(args || {});
}

(function(){
  var m = {};
  DORMANT_TOOLS.forEach(function(t) {
    m[t.name] = { usd: t._price || 0.02, atomic: Math.round((t._price || 0.02) * 1e6) };
  });
  module.exports.PRICE_BY_TOOL = m;
})();

module.exports = {
  DORMANT_TOOLS: DORMANT_TOOLS,
  runDormant: runIncome,
  PRICE_BY_TOOL: (function(){
    var m = {};
    DORMANT_TOOLS.forEach(function(t) {
      m[t.name] = { usd: t._price || 0.02, atomic: Math.round((t._price || 0.02) * 1e6) };
    });
    return m;
  })()
};
console.log('[income-v4] loaded', DORMANT_TOOLS.length, 'tools');

/**
 * build-asset-catalog.js — normalize REAL public digital-asset sources into one
 * x402 asset catalog.
 *
 * Sources (all downloaded by scripts/fetch-asset-sources.js / manual curl):
 *   data/tw-tokenlist-<chain>.json            Trust Wallet curated token lists
 *   data/src-ethereum-lists-tokens/tokens/    ethereum-lists/tokens (per-token JSON)
 *   data/map3-clone/<address>/info.json       map3xyz/ethereum-tokenlist (per-token JSON)
 *   data/src-coingecko-mirror.json            CoinGecko coin identities (no addresses)
 *
 * Output: data/asset-catalog.json  (10,000+ real assets, deduped, policy-screened)
 *
 * METADATA ONLY. This never moves funds and never changes the single-treasury
 * payTo. Assets are scored against config/treasury-policy.json so the x402
 * layer can expose discoverable / priced / policy-eligible flags.
 *
 * Usage: node scripts/build-asset-catalog.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.resolve(ROOT, '..', '..', 'data');

const CHAIN_META = {
  ethereum:   { chainId: 1,     name: 'Ethereum' },
  smartchain: { chainId: 56,    name: 'BNB Chain' },
  base:       { chainId: 8453,  name: 'Base' },
  arbitrum:   { chainId: 42161, name: 'Arbitrum' },
  polygon:    { chainId: 137,   name: 'Polygon' },
  optimism:   { chainId: 10,    name: 'Optimism' },
  avalanche:  { chainId: 43114, name: 'Avalanche' },
};
// Sushiswap chains with their proper chain IDs
const SU_CHAIN_ID = {
  mainnet: 1, matic: 137, bsc: 56, arbitrum: 42161,
  avalanche: 43114, fantom: 250, harmony: 1666600000,
  moonbeam: 1284, fuse: 122, celo: 42220, xdai: 100,
  okex: 66, moonriver: 1285, clover: 1023, heco: 128, palm: 11297108,
};
const SU_CHAIN_NAME = {
  mainnet:'Ethereum', matic:'Polygon', bsc:'BNB Chain', arbitrum:'Arbitrum',
  avalanche:'Avalanche', fantom:'Fantom', harmony:'Harmony', moonbeam:'Moonbeam',
  fuse:'Fuse', celo:'Celo', xdai:'Gnosis', okex:'OKC', moonriver:'Moonriver',
  clover:'Clover', heco:'HECO', palm:'PALM',
};
const BY_CHAIN_ID = {};
for (const [k, v] of Object.entries(CHAIN_META)) BY_CHAIN_ID[v.chainId] = k;

const STABLE = new Set(['USDC','USDT','DAI','USDS','USDE','USDF','FDUSD','TUSD','USDP','BUSD','PYUSD','CRVUSD','FRAX','LUSD','GHO','SUSD','MIM','DOLA','USDD','USDN','BUIDL','USD0','USD1','RLUSD','EURC']);
const BLUECHIP = new Set(['BTC','WBTC','CBBTC','ETH','WETH','STETH','WSTETH','RETH','CETH','BNB','WBNB','MATIC','WMATIC','AVAX','WAVAX','ARB','OP']);
const SUSPICIOUS = /(airdrop|reward|bonus|giveaway|free|moon|safe|inu|doge|pepe|shiba|elon|king|queen|gem|meme|1000x|swap|bot|auto|nft|game|play|meta|verse)/i;
const ALLOWED_DEPOSIT_CHAINS = new Set(['base','ethereum','arbitrum','optimism']);

function cleanSymbol(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32); }
function cleanName(s) { return String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120); }
function normAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || '')) ? String(a).toLowerCase() : null; }

function screen(asset) {
  const sym = asset.symbol || '';
  const name = (asset.name || '').toLowerCase();
  const stable = STABLE.has(sym);
  const bluechip = BLUECHIP.has(sym);
  const suspicious = SUSPICIOUS.test(sym) || SUSPICIOUS.test(name);

  let risk = 45;
  if (asset.logoURI) risk += 12;
  if (asset.marketCapRank && asset.marketCapRank <= 100) risk += 18;
  else if (asset.marketCapRank && asset.marketCapRank <= 1000) risk += 10;
  if (stable) risk += 22;
  else if (bluechip) risk += 14;
  if (suspicious) risk -= 25;
  if ((asset.name || '').length > 40) risk -= 6;
  if (asset.address && (!Number.isInteger(asset.decimals) || asset.decimals < 6 || asset.decimals > 18)) risk -= 8;
  risk = Math.max(0, Math.min(100, risk));

  const depositEligible = stable && !!asset.logoURI && !suspicious &&
    asset.address && ALLOWED_DEPOSIT_CHAINS.has(asset.chain);

  const reasons = [];
  if (!stable) reasons.push('not a stablecoin (requireStablecoin)');
  if (!asset.logoURI) reasons.push('unverified metadata / no logo');
  if (suspicious) reasons.push('suspicious symbol/name');
  if (!asset.address) reasons.push('no EVM contract address');
  else if (!ALLOWED_DEPOSIT_CHAINS.has(asset.chain)) reasons.push('chain outside single-asset venue whitelist');

  return {
    riskScore: risk,
    riskGrade: risk >= 80 ? 'A' : risk >= 65 ? 'B' : risk >= 45 ? 'C' : 'D',
    flags: { stablecoin: stable, bluechip, suspicious, hasLogo: !!asset.logoURI },
    policy: {
      depositEligible,
      status: depositEligible ? 'eligible-for-review' : 'excluded',
      reasons: depositEligible ? ['stablecoin + verified metadata + allowed chain'] : reasons,
      note: 'Metadata screening only. No funds are moved; per-transaction human approval still required.'
    }
  };
}

function makeAsset(base) {
  const asset = Object.assign({
    id: null, chain: null, chainId: null, chainName: null, address: null,
    symbol: '', name: '', decimals: 18, type: 'ERC20', logoURI: null,
    marketCapRank: null, source: null, sourceUrl: null,
  }, {
    address: base.address || null,
    chain: base.chain || null,
    chainId: Number.isInteger(base.chainId) ? base.chainId : null,
    chainName: base.chainName || null,
    symbol: cleanSymbol(base.symbol), name: cleanName(base.name),
    decimals: Number.isInteger(base.decimals) ? base.decimals : 18,
    type: base.type || 'ERC20', logoURI: base.logoURI || null,
    marketCapRank: base.marketCapRank || null,
    source: base.source, sourceUrl: base.sourceUrl || null,
  });
  Object.assign(asset, screen(asset));
  return asset;
}

function addAsset(store, asset) {
  if (!asset.symbol || !asset.name) return false;
  if (store.has(asset.id)) return false;
  store.set(asset.id, asset);
  return true;
}

function loadTrustWallet(store) {
  let added = 0;
  for (const [chain, meta] of Object.entries(CHAIN_META)) {
    const f = path.join(DATA, `tw-tokenlist-${chain}.json`);
    if (!fs.existsSync(f)) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log('  skip bad', f); continue; }
    for (const t of (j.tokens || [])) {
      const addr = normAddr(t.address);
      if (!addr) continue;
      const a = makeAsset({ ...t, address: addr, chain, chainId: meta.chainId, chainName: meta.name,
        source: 'trustwallet', type: t.type || 'ERC20', logoURI: t.logoURI || null });
      a.id = `${meta.chainId}:${addr}`;
      if (addAsset(store, a)) added++;
    }
  }
  console.log(`  trustwallet: +${added}`);
}

function loadEthereumLists(store) {
  const root = path.join(DATA, 'src-ethereum-lists-tokens', 'tokens');
  if (!fs.existsSync(root)) { console.log('  ethereum-lists: source not extracted, skip'); return 0; }
  let added = 0;
  for (const chain of fs.readdirSync(root)) {
    const dir = path.join(root, chain);
    if (!fs.statSync(dir).isDirectory()) continue;
    const chainKey = ({ eth:'ethereum', bsc:'smartchain', arb:'arbitrum', matic:'polygon', avax:'avalanche', op:'optimism' })[chain] || null;
    const meta = chainKey ? CHAIN_META[chainKey] : null;
    const chainId = meta ? meta.chainId : null;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
      let t;
      try { t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
      const addr = normAddr(t.address);
      if (!addr) continue;
      const a = makeAsset({
        symbol: t.symbol, name: t.name, decimals: t.decimals,
        address: addr, chain: chainKey || chain, chainId,
        chainName: meta ? meta.name : chain,
        type: t.type || 'ERC20',
        logoURI: (t.logo && (t.logo.src || t.logo.ipfs_hash)) || null,
        source: 'ethereum-lists',
        sourceUrl: `https://github.com/ethereum-lists/tokens/blob/master/tokens/${chain}/${f}`,
      });
      a.id = `${chainId != null ? chainId : 'evm'}:${addr}`;
      if (addAsset(store, a)) added++;
    }
  }
  console.log(`  ethereum-lists: +${added}`);
}

function loadMap3(store) {
  const root = path.join(DATA, 'map3-clone');
  if (!fs.existsSync(root)) { console.log('  map3: source not cloned, skip'); return 0; }
  let added = 0;
  for (const d of fs.readdirSync(root)) {
    const f = path.join(root, d, 'info.json');
    if (!fs.existsSync(f)) continue;
    let t;
    try { t = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
    const addr = normAddr(t.address) || normAddr(d);
    if (!addr) continue;
    if (t.spam === true || t.active === false) continue;
    const a = makeAsset({
      symbol: t.symbol, name: t.name, decimals: t.decimals,
      address: addr, chain: 'ethereum', chainId: 1, chainName: 'Ethereum',
      type: t.type || 'ERC20',
      logoURI: t.logoURI || (t.logo && (t.logo.png || t.logo.src)) || null,
      source: 'map3',
      sourceUrl: `https://github.com/map3xyz/ethereum-tokenlist/tree/master/${d}`,
    });
    a.id = `1:${addr}`;
    if (addAsset(store, a)) added++;
  }
  console.log(`  map3: +${added}`);
}

function loadCoinGecko(store) {
  const f = path.join(DATA, 'src-coingecko-mirror.json');
  if (!fs.existsSync(f)) { console.log('  coingecko: source missing, skip'); return 0; }
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log('  skip bad coingecko json'); return 0; }
  let added = 0;
  for (const c of j) {
    if (!c.id || !c.symbol) continue;
    const a = makeAsset({
      symbol: c.symbol, name: c.name, decimals: null, address: null,
      chain: 'native', chainId: 0, chainName: 'Native / multi-chain',
      type: 'COIN', logoURI: null,
      marketCapRank: c.market_cap_rank || null,
      source: 'coingecko-mirror',
      sourceUrl: `https://www.coingecko.com/en/coins/${c.id}`,
    });
    a.id = `coingecko:${c.id}`;
    a.coingeckoId = c.id;
    if (addAsset(store, a)) added++;
  }
  console.log(`  coingecko: +${added}`);
}

function loadSushiswap(store) {
  const root = path.join(DATA, 'sushiswap-tokens');
  if (!fs.existsSync(root)) { console.log('  sushiswap: source not found, skip'); return 0; }
  let added = 0;
  for (const f of fs.readdirSync(root).filter(x => x.endsWith('.json'))) {
    const chain = f.replace('.json', '');
    const chainId = SU_CHAIN_ID[chain] || null;
    const chainName = SU_CHAIN_NAME[chain] || chain;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) { continue; }
    for (const t of (Array.isArray(j) ? j : [])) {
      const addr = normAddr(t.address);
      if (!addr) continue;
      const a = makeAsset({
        symbol: t.symbol, name: t.name, decimals: Number.isInteger(t.decimals) ? t.decimals : 18,
        address: addr, chain: chain, chainId, chainName,
        type: 'ERC20', logoURI: t.logoURI || null,
        source: 'sushiswap',
        sourceUrl: `https://github.com/sushiswap/default-token-list/blob/master/tokens/${f}`,
      });
      a.id = `${chainId != null ? chainId : 'evm'}:${addr}`;
      if (addAsset(store, a)) added++;
    }
  }
  console.log(`  sushiswap: +${added}`);
}

function loadAave(store) {
  const f = path.join(DATA, 'aave-tokens', 'mainnet.json');
  if (!fs.existsSync(f)) { console.log('  aave: source not found, skip'); return 0; }
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log('  skip bad aave json'); return 0; }
  // Normalize: AAVE tokenlist can be array of {symbol,name,address,decimals,logoURI} or {tokens:[...]}
  var items = Array.isArray(j) ? j : (j.tokens || []);
  let added = 0;
  for (const t of items) {
    const addr = normAddr(t.address);
    if (!addr) continue;
    const a = makeAsset({
      symbol: t.symbol, name: t.name, decimals: Number.isInteger(t.decimals) ? t.decimals : 18,
      address: addr, chain: 'ethereum', chainId: 1, chainName: 'Ethereum',
      type: 'ERC20', logoURI: t.logoURI || null,
      source: 'aave',
      sourceUrl: `https://github.com/bgd-labs/aave-tokenlist/blob/main/tokenlist.json`,
    });
    a.id = `1:${addr}`;
    if (addAsset(store, a)) added++;
  }
  console.log(`  aave: +${added}`);
}

function main() {
  console.log('Building x402 asset catalog from REAL public sources...');
  const store = new Map();

  // Richest curated metadata first so dedupe keeps logo-bearing records.
  loadTrustWallet(store);
  loadEthereumLists(store);
  loadMap3(store);
  loadSushiswap(store);
  loadAave(store);
  loadCoinGecko(store);

  const all = [...store.values()].sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return String(a.id).localeCompare(String(b.id));
  });

  const chains = {};
  const sources = {};
  for (const a of all) {
    chains[a.chain] = (chains[a.chain] || 0) + 1;
    sources[a.source] = (sources[a.source] || 0) + 1;
  }
  const stats = {
    builtAt: new Date().toISOString(),
    totalAssets: all.length,
    withContractAddress: all.filter(a => !!a.address).length,
    nativeCoins: all.filter(a => !a.address).length,
    chains,
    sources,
    stablecoins: all.filter(a => a.flags.stablecoin).length,
    bluechips: all.filter(a => a.flags.bluechip).length,
    policyEligible: all.filter(a => a.policy.depositEligible).length,
    excluded: all.filter(a => !a.policy.depositEligible).length,
    sourceList: [
      'Trust Wallet assets tokenlists (GitHub raw)',
      'ethereum-lists/tokens (GitHub)',
      'map3xyz/ethereum-tokenlist (GitHub)',
      'Sushiswap default token list (GitHub, 16 chains)',
      'CoinGecko coin identities mirror (GitHub)'
    ],
    note: 'Real metadata catalog for x402 discovery/pricing/screening. Never moves funds. No fabricated entries.'
  };

  const OUT = path.join(ROOT, 'data', 'asset-catalog.json');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ stats, assets: all }), 'utf8');
  console.log(`\nWrote ${OUT}`);
  console.log(JSON.stringify(stats, null, 2));
}

main();

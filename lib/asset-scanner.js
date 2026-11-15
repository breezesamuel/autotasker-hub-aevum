/**
 * asset-scanner.js — 多链资产扫描器
 *
 * 扫描所有已知旧钱包在各主流链上的代币余额：
 *   - Base / Ethereum / Arbitrum / BSC / Polygon (EVM)
 *   - Solana (via helius/public RPC)
 *
 * 输出：发现沉睡/未动用资产 → 生成扫款清单（tx参数）
 *
 * 端点：
 *   GET /api/assets/scan        — 扫描所有已知地址
 *   GET /api/assets/recovery    — 生成扫款操作指南（含精确合约调用数据）
 */
'use strict';

const https = require('https');

// ── Known Addresses ───────────────────────────────────────────────────────────
const KNOWN_ADDRESSES = {
  TREASURY:     '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C',
  LEGACY_FAC:   '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
  GENESIS_ID:   '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38',
  LEGACY_PAYTO: '0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3',
};

// ── Chains & Token Lists ─────────────────────────────────────────────────────
const CHAINS = {
  base:      { name: 'Base',       rpc: 'https://mainnet.base.org',          explorer: 'https://basescan.org' },
  ethereum:  { name: 'Ethereum',   rpc: 'https://eth.llamarpc.com',           explorer: 'https://etherscan.io' },
  arbitrum:  { name: 'Arbitrum',   rpc: 'https://arb1.arbitrum.io/rpc',       explorer: 'https://arbiscan.io' },
  bsc:       { name: 'BNB Chain',  rpc: 'https://bsc-dataseed.binance.org',   explorer: 'https://bscscan.com' },
  polygon:   { name: 'Polygon',    rpc: 'https://polygon-rpc.com',            explorer: 'https://polygonscan.com' },
};

const EVM_TOKENS = [
  // USDC variants
  { symbol: 'USDC',  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, chains: ['ethereum'] },       // ETH mainnet
  { symbol: 'USDC',  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chains: ['base','arbitrum','polygon','bsc'] }, // multicoin
  // USDT variants
  { symbol: 'USDT',  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, chains: ['ethereum'] },
  { symbol: 'USDT',  address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, chains: ['base'] },
  { symbol: 'USDT',  address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', decimals: 6, chains: ['arbitrum'] },
  // DAI
  { symbol: 'DAI',   address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, chains: ['ethereum'] },
  { symbol: 'DAI',   address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, chains: ['base'] },
  // WETH
  { symbol: 'WETH',  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, chains: ['ethereum'] },
  { symbol: 'WETH',  address: '0x4200000000000000000000000000000000000006', decimals: 18, chains: ['base'] },
  // AERO (Base only)
  { symbol: 'AERO',  address: '0xcada80489142cDE1c32CFFCd7961c60eEcD8BdCa', decimals: 18, chains: ['base'] },
  // cbBTC
  { symbol: 'cbBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, chains: ['base'] },
];

const TREASURY_ADDR = process.env.PAY_TO || KNOWN_ADDRESSES.TREASURY;

// Cache last scan result (valid for 10 minutes)
let _lastScanResult = null;
let _lastScanTime = 0;
const SCAN_CACHE_TTL = 10 * 60 * 1000;

// ── EVM Helpers ───────────────────────────────────────────────────────────────
function padAddr(addr) { return addr.replace(/^0x/i,'').toLowerCase().padStart(64,'0'); }
function hexToNum(hex) { if (!hex || !hex.startsWith('0x')) return 0; return parseInt(hex, 16); }

function rpcCall(rpcUrl, method, params, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc:'2.0', id:1, method, params });
    const url = new URL(rpcUrl);
    const opts = { hostname:url.hostname, path:url.pathname+url.search, method:'POST',
      timeout: timeoutMs, headers:{'content-type':'application/json','Content-Length':Buffer.byteLength(body)} };
    const req = https.request(opts, res => {
      let b=''; res.on('data', c=>{b+=c;});
      res.on('end', ()=>{ try{ resolve(JSON.parse(b).result); } catch(e){ reject(new Error('bad json')); }});
    });
    req.on('error', e=>reject(e));
    req.on('timeout', ()=>{ req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}

async function getBalance(rpcUrl, contractAddress, walletAddress, decimals) {
  const fnSelector = '0x70a08231' + padAddr(walletAddress);
  try {
    const raw = await rpcCall(rpcUrl, 'eth_call', [{to: contractAddress, data: fnSelector}, 'latest']);
    return hexToNum(raw) / Math.pow(10, decimals);
  } catch (e) { return 0; }
}

async function getEthBalance(rpcUrl, addr) {
  try {
    const raw = await rpcCall(rpcUrl, 'eth_getBalance', [addr, 'latest']);
    return hexToNum(raw) / 1e18;
  } catch (e) { return 0; }
}

// ── Solana Helpers ────────────────────────────────────────────────────────────
// Note: EOA wallets don't have Solana equivalents unless user has a Solana wallet
// This section is reserved for future extension when Solana wallet keys are added
const SOLANA_ADDRS = []; // populated from config/keys/solana-wallets.json when available

function scanSolana() {
  return { ok: false, message: 'No Solana wallets configured yet. Add to config/keys/solana-wallets.json' };
}

// ── Main Scanner ──────────────────────────────────────────────────────────────
async function scanAll(addresses) {
  addresses = addresses || KNOWN_ADDRESSES;
  const results = { scannedAt: new Date().toISOString(), totalUsdValue: 0, chains: {}, warnings: [] };

  for (const [chainKey, chainInfo] of Object.entries(CHAINS)) {
    const chainResults = { ethBalance: 0, tokens: [], nativeSymbol: 'ETH' };

    // Get native ETH balance (for each chain that uses ETH as gas)
    for (const [label, addr] of Object.entries(addresses)) {
      const ethBal = await getEthBalance(chainInfo.rpc, addr);
      if (ethBal > 0.0001) chainResults.ethBalance += ethBal;
    }

    // Scan ERC-20 tokens for this chain
    const chainTokens = EVM_TOKENS.filter(t => t.chains.includes(chainKey));
    for (const token of chainTokens) {
      const tokenHoldings = {};
      let totalTokenUsd = 0;
      for (const [label, addr] of Object.entries(addresses)) {
        const bal = await getBalance(chainInfo.rpc, token.address, addr, token.decimals);
        if (bal > 0.0001) {
          tokenHoldings[label] = { symbol: token.symbol, balance: bal, contract: token.address };
          // Approximate USD value
          const priceMap = { USDC:1, USDT:1, DAI:1, WETH:3800, cbBTC:94000, AERO:0.8 };
          const price = priceMap[token.symbol] || 0;
          totalTokenUsd += bal * price;
        }
      }
      if (Object.keys(tokenHoldings).length > 0) {
        chainResults.tokens.push({ ...token, holdings: tokenHoldings, estimatedUsd: totalTokenUsd });
        results.totalUsdValue += totalTokenUsd;
      }
    }

    // Also check for native token on non-ETH chains (BNB, MATIC, etc.)
    if (chainKey === 'bsc') {
      chainResults.nativeSymbol = 'BNB';
    } else if (chainKey === 'polygon') {
      chainResults.nativeSymbol = 'MATIC';
    }

    results.chains[chainKey] = chainResults;
  }

  // Collect warnings
  for (const [label, addr] of Object.entries(addresses)) {
    // Per-wallet checks done during scan; add treasury warning below
  }
  if (!results.chains.base || !results.chains.base.tokens) results.warnings.push('Base chain scan incomplete');
  const treasHasAsset = results.chains.base && results.chains.base.tokens &&
    results.chains.base.tokens.some(t => t.holdings && t.holdings[TREASURY_ADDR] && t.holdings[TREASURY_ADDR].balance > 0);
  if (!treasHasAsset) results.warnings.push('Treasury ' + TREASURY_ADDR.slice(0,10) + ' has no assets — run sweep from legacy wallets');

  return results;
}

function buildWarnings(results) {
  const warnings = [];
  if (!results || !results.chains || !results.chains.base) return warnings;
  const treasHasAsset = results.chains.base.tokens &&
    results.chains.base.tokens.some(t => t.holdings && t.holdings[TREASURY_ADDR] && t.holdings[TREASURY_ADDR].balance > 0);
  if (!treasHasAsset) {
    warnings.push('Treasury ' + TREASURY_ADDR.slice(0,10) + ' has no assets — run sweep from legacy wallets');
  }
  return warnings;
}

function generateRecoveryGuide(sweepResults) {
  const guide = { generatedAt: new Date().toISOString(), steps: [], warnings: [] };
  for (const [chainKey, chainData] of Object.entries(sweepResults.chains)) {
    for (const token of (chainData.tokens || [])) {
      for (const [walletLabel, holding] of Object.entries(token.holdings)) {
        if (holding.balance <= 0) continue;
        const fromAddr = KNOWN_ADDRESSES[walletLabel];
        if (!fromAddr) continue;
        guide.steps.push({
          chain: CHAINS[chainKey].name,
          from: walletLabel + ' (' + fromAddr.slice(0,10) + '…' + fromAddr.slice(-4) + ')',
          token: token.symbol,
          amount: holding.balance.toFixed(token.decimals === 6 ? 6 : 18),
          txType: token.symbol === 'USDC' || token.symbol === 'USDT' ? 'ERC20_TRANSFER' : 'NATIVE',
          targetTreasury: TREASURY_ADDR,
          contractAddress: token.address,
          explorerLink: CHAINS[chainKey].explorer + '/address/' + fromAddr,
        });
      }
    }
  }
  // Sort by estimated value descending
  guide.steps.sort((a,b) => b.amount - a.amount);
  guide.totalSteps = guide.steps.length;
  guide.treasuryTarget = TREASURY_ADDR;
  return guide;
}

// ── Public API ────────────────────────────────────────────────────────────────
async function runScan(addresses, forceFresh) {
  if (!forceFresh && _lastScanResult && Date.now() - _lastScanTime < SCAN_CACHE_TTL) {
    return _lastScanResult;
  }
  try {
    const r = await scanAll(addresses);
    _lastScanResult = r;
    _lastScanTime = Date.now();
    return r;
  } catch (e) {
    // Return cached result on error so /recovery still works
    if (_lastScanResult) return _lastScanResult;
    return { ok: false, error: e.message };
  }
}

function getSummary() {
  return {
    knownWallets: Object.keys(KNOWN_ADDRESSES).length,
    supportedChains: Object.keys(CHAINS).join(', '),
    treasuryAddress: TREASURY_ADDR,
    note: 'Run /api/assets/scan for live balances. Run /api/assets/recovery for sweep instructions.',
  };
}

module.exports = {
  KNOWN_ADDRESSES, CHAINS, EVM_TOKENS, TREASURY_ADDR,
  scanAll, generateRecoveryGuide, runScan, getSummary,
  getLastScanResult: () => _lastScanResult,
};

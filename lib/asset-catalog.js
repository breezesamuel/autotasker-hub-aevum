/**
 * asset-catalog.js — query layer for the normalized 10,000+ asset catalog.
 *
 * Reads data/asset-catalog.json (built by scripts/build-asset-catalog.js).
 * Pure read-only: never signs, never transfers, never changes payTo.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'data', 'asset-catalog.json');
let _cache = null;
let _idxId = null;
let _idxAddr = null;
let _idxSymbol = null;
let _idxChain = null;

function load(force) {
  if (_cache && !force) return _cache;
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    _cache = { stats: j.stats || {}, assets: Array.isArray(j.assets) ? j.assets : [] };
  } catch (e) {
    _cache = { stats: { totalAssets: 0, error: e.message }, assets: [] };
  }
  _idxId = new Map(); _idxAddr = new Map(); _idxSymbol = new Map(); _idxChain = new Map();
  for (const a of _cache.assets) {
    _idxId.set(a.id, a);
    _idxAddr.set(`${a.chainId}:${a.address}`, a);
    const s = a.symbol.toUpperCase();
    if (!_idxSymbol.has(s)) _idxSymbol.set(s, []);
    _idxSymbol.get(s).push(a);
    if (!_idxChain.has(a.chain)) _idxChain.set(a.chain, []);
    _idxChain.get(a.chain).push(a);
  }
  return _cache;
}

function stats() { return load().stats; }
function total() { return load().assets.length; }

function getById(id) { load(); return _idxId.get(String(id).toLowerCase()) || null; }

function getByAddress(addr, chain) {
  load();
  const clean = String(addr || '').toLowerCase();
  if (chain) return _idxAddr.get(`${chain}:${clean}`) || null;
  for (const [k, v] of _idxAddr) if (k.endsWith(`:${clean}`)) return v;
  return null;
}

function getBySymbol(symbol) {
  load();
  return (_idxSymbol.get(String(symbol || '').toUpperCase()) || []).slice();
}

function search(q, opts) {
  opts = opts || {};
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 20));
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return { query: q, total: 0, results: [] };
  load();
  const out = [];
  for (const a of _cache.assets) {
    if (a.symbol.toLowerCase() === needle || a.name.toLowerCase() === needle) {
      out.push(a); continue;
    }
    if (a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) || (a.address || '').includes(needle) || (a.coingeckoId || '').includes(needle)) {
      out.push(a);
    }
    if (out.length >= 5000) break;
  }
  out.sort((a, b) => {
    const sa = a.symbol.toLowerCase() === needle ? 0 : 1;
    const sb = b.symbol.toLowerCase() === needle ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return b.riskScore - a.riskScore;
  });
  return { query: q, total: out.length, results: out.slice(0, limit) };
}

function listByChain(chain, limit, offset) {
  load();
  const arr = _idxChain.get(String(chain || '').toLowerCase()) || [];
  const off = Math.max(0, Number(offset) || 0);
  const lim = Math.min(500, Math.max(1, Number(limit) || 50));
  return { chain, total: arr.length, offset: off, limit: lim, results: arr.slice(off, off + lim) };
}

function listEligible(limit, offset) {
  load();
  const arr = _cache.assets.filter(a => a.policy.depositEligible);
  const off = Math.max(0, Number(offset) || 0);
  const lim = Math.min(500, Math.max(1, Number(limit) || 50));
  return { total: arr.length, offset: off, limit: lim, results: arr.slice(off, off + lim) };
}

function listExcluded(limit, offset) {
  load();
  const arr = _cache.assets.filter(a => !a.policy.depositEligible);
  const off = Math.max(0, Number(offset) || 0);
  const lim = Math.min(500, Math.max(1, Number(limit) || 50));
  return { total: arr.length, offset: off, limit: lim, results: arr.slice(off, off + lim) };
}

function priceHint(asset) {
  if (asset.flags && asset.flags.stablecoin) {
    return { usd: 1, method: 'stablecoin-peg', note: 'peg reference only, not a live oracle quote' };
  }
  return { usd: null, method: 'unavailable', note: 'no live price feed wired; metadata-only at this stage' };
}

function risk(id) {
  const a = getById(id);
  if (!a) return { found: false, id };
  return { found: true, id, symbol: a.symbol, chain: a.chain, score: a.riskScore, grade: a.riskGrade, flags: a.flags, policy: a.policy };
}

function exportTokenList(chain, limit) {
  load();
  const arr = chain ? (_idxChain.get(String(chain).toLowerCase()) || []) : _cache.assets;
  const lim = Math.min(2000, Math.max(1, Number(limit) || 200));
  return {
    name: `AutoTasker x402 asset catalog${chain ? ' — ' + chain : ''}`,
    timestamp: new Date().toISOString(),
    tokens: arr.filter(a => !!a.address).slice(0, lim).map(a => ({
      chainId: a.chainId, address: a.address, symbol: a.symbol, name: a.name,
      decimals: a.decimals, logoURI: a.logoURI || undefined
    }))
  };
}

function coverage() {
  load();
  const out = {};
  for (const [chain, arr] of _idxChain) {
    out[chain] = {
      total: arr.length,
      stablecoins: arr.filter(a => a.flags.stablecoin).length,
      eligible: arr.filter(a => a.policy.depositEligible).length,
      avgRisk: Math.round(arr.reduce((s, a) => s + a.riskScore, 0) / Math.max(1, arr.length))
    };
  }
  return out;
}

function reload() { return load(true); }

module.exports = {
  stats, total, search, getById, getByAddress, getBySymbol,
  listByChain, listEligible, listExcluded, priceHint, risk,
  exportTokenList, coverage, reload, FILE
};

console.log('[asset-catalog] module loaded, file:', FILE);

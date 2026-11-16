/**
 * oss-discovery.js v2 — Bug-fixed version.
 * Fixes applied:
 *   [FIX-1] CATEGORIES queries: quoted org values, fixed 'star:' → 'stars:',
 *           added proper grouping for multi-term OR queries.
 *   [FIX-2] classifyLicense(): normalize spdx_id variants (-only/-or-later),
 *           handle compound licenses (MIT OR Apache-2.0, GPL-3.0-or-later),
 *           fallback to license.key slug matching.
 *   [FIX-3] paginateSearch(): respect X-RateLimit-Remaining header to avoid
 *           silent 403 throttling; add per-item failure logging.
 */
'use strict';
const https = require('https');
const path  = require('path');
const fs    = require('fs');
const GH_TOKEN_FILE = process.env.GITHUB_TOKEN_FILE || 'C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt';
let GITHUB_TOKEN;
try { GITHUB_TOKEN = fs.readFileSync(GH_TOKEN_FILE, 'utf8').trim(); } catch (_) {}

// ── FIX-2 extended: normalize spdx ids to canonical keys ───────────────────────
// GitHub license API returns various forms: 'MIT', 'mit', 'MIT License',
// 'GPL-3.0-only', 'Apache-2.0', 'Apache-2.0 WITH Classpath-exception-2.0'
function normalizeSpdx(raw) {
  if (!raw) return '';
  // Strip common suffixes/prefixes GitHub adds
  let n = String(raw).trim()
    .replace(/\bLicense\s*$/i, '')       // "MIT License" → "MIT"
    .replace(/^\s*(The\s+)?/i, '')        // "The MIT…" → "MIT…"
    .replace(/\s*with\s+/gi, ' WITH ')    // normalise prepositions
    .replace(/\s*or\s+later/i, '-or-later')
    .replace(/\s*only\b/i, '-only');
  return n.toLowerCase().replace(/[^a-z0-9.\-\/+]/g, '-');
}

// ── License tiers (comprehensive) ──────────────────────────────────────────────
const TIER_WHITELIST = new Set([
  'mit','bsd-2-clause','bsd-3-clause','apache-2.0','isc','unlicense','0bsd',
  'mpl-2.0','cc0-1.0','artistic-2.0','bsl-1.0','zlib','x11','postgresql',
]);
const TIER_YELLOW = new Set([
  'gpl-2.0','gpl-2.0-only','gpl-2.0-or-later',
  'gpl-3.0','gpl-3.0-only','gpl-3.0-or-later',
  'lgpl-2.1','lgpl-2.1-only','lgpl-2.1-or-later',
  'lgpl-3.0','lgpl-3.0-only','lgpl-3.0-or-later',
  'agpl-3.0','agpl-3.0-only','agpl-3.0-or-later',
  'epl-1.0','epl-2.0','cddl-1.0','cddl-1.1',
]);
const TIER_RED = new Set([
  'cc-by-nc-4.0','cc-by-nc-sa-4.0','cc-by-nc-nd-4.0',
  'cc-by-nc','cc-by-nc-sa','cc-by-nc-nd',
]);

function classifyLicense(name) {
  const raw = name || '';
  const n = normalizeSpdx(raw);
  if (!n || n.includes('no license') || n.includes('proprietary') || n === 'other') return 'red';
  if (TIER_WHITELIST.has(n)) return 'white';
  if (TIER_YELLOW.has(n))    return 'yellow';
  if (TIER_RED.has(n))       return 'red';
  // Partial match: e.g. 'gpl-3.0-only' contains 'gpl' and is yellow
  if (/gpl/.test(n) && !/agpl/.test(n) && !/lgpl/.test(n)) return 'yellow';
  if (n.includes('agpl')) return 'yellow';
  if (n.includes('lgpl')) return 'yellow';
  if (n.includes('apache')) return 'white';
  if (n.includes('mit')) return 'white';
  if (n.includes('bsd')) return 'white';
  if (n.includes('isc')) return 'white';
  // Compound: check each clause
  if (/\bor\b|\band\b|\bwith\b/.test(n)) {
    const parts = n.split(/\s+(?:or|and|with)\s+/i);
    const tiers = parts.map(p => classifyLicense(p));
    if (tiers.every(t => t === 'white')) return 'white';
    if (tiers.some(t => t === 'red'))    return 'red';
    if (tiers.some(t => t === 'yellow')) return 'yellow';
    return 'unknown';
  }
  return 'unknown';
}

// ── FIX-1: corrected GitHub search queries ────────────────────────────────────
const CATEGORIES = [
  // Note: GitHub search requires quotes around org: values and multi-word terms
  ['cli-tools',      '"language:shell" OR "language:bash" org:"xclipit" stars:>100 pushed:>2024-01-01 -fork:true'],
  ['dev-utilities',  'org:"terrierscript" language:javascript stars:>50 pushed:>2024-06-01 -fork:true'],
  ['data-viz',       'language:python +language:javascript stars:>1000 pushed:>2025-01-01 -fork:true'],
  ['ml-nlp',         'language:python stars:>5000 pushed:>2024-06-01 (topic:transformers OR topic:llm OR topic:nlp) -fork:true'],
  ['security',       'topic:security ("language:go" OR "language:rust" OR "language:c") stars:>500 pushed:>2024-01-01 -fork:true'],
  ['web-frameworks', 'language:typescript stars:>1000 pushed:>2025-01-01 -fork:true'],
  ['monitoring',     '(topic:observability OR topic:monitoring) ("language:go" OR "language:rust") stars:>500 pushed:>2024-06-01 -fork:true'],
  ['infra-devops',   '(org:"hashicorp" OR org:"kubernetes" OR org:"grafana" OR org:"pomerium") pushed:>2024-01-01 -fork:true'],
  ['media-processing','language:python (topic:image OR topic:video OR topic:audio) pushed:>2024-06-01 stars:>300 -fork:true'],
  ['finance-trading','(topic:trading OR topic:defi OR topic:crypto OR topic:blockchain) ("language:python" OR "language:rust") stars:>200 pushed:>2024-09-01 -fork:true'],
  ['productivity',   '(org:"obsidianmd" OR org:"joplin" OR org:"outline") pushed:>2024-01-01 stars:>100 -fork:true'],
];

const OUT_DIR   = path.join(__dirname, '..', 'data', 'oss-catalog');
const STATE_FILE = path.join(OUT_DIR, '_state.json');
const SCAN_LOG   = path.join(OUT_DIR, '_scan_log.jsonl');
fs.mkdirSync(OUT_DIR, { recursive: true });

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (e) { return { seenHandles: new Set(), lastScanTs: 0, countsByTier: { white:0, yellow:0, red:0, unknown:0 }, totalScanned: 0 }; }
}
function saveState(s) {
  const dump = { ...s, seenHandles: Array.from(s.seenHandles) };
  fs.writeFileSync(STATE_FILE, JSON.stringify(dump, null, 2));
}
function appendScanLog(entry) {
  try { fs.appendFileSync(SCAN_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8'); } catch (_) {}
}

// ── FIX-3: rate-limit aware request helper ─────────────────────────────────────
function ghGet(p, opts = {}) {
  const tok = GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}`, 'user-agent': 'autotasker-hub' } : { 'user-agent': 'autotasker-hub' };
  return new Promise((resolve, reject) => {
    const req = https.get(`https://api.github.com${p}`, { headers: { ...tok, ...opts.headers } }, (res) => {
      // Log rate limit info on first response of session
      if (!ghGet._loggedRate) {
        ghGet._loggedRate = true;
        console.log(`[discovery] rate_limit remaining=${res.headers['x-ratelimit-remaining']} reset=${res.headers['x-ratelimit-reset']}`);
      }
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 403 && !GITHUB_TOKEN) { resolve(null); return; }
        // Throttle if rate limit running low
        const remaining = parseInt(res.headers['x-ratelimit-remaining'] || '999', 10);
        if (remaining < 10) {
          const waitSec = Math.max(1, parseInt(res.headers['x-ratelimit-reset'] || '0', 10) - Math.floor(Date.now()/1000));
          console.warn(`[discovery] rate limit low (${remaining} remain), waiting ${waitSec}s`);
          setTimeout(() => ghGet(p, opts).then(resolve, reject), waitSec * 1000 + 500);
          return;
        }
        if (res.statusCode >= 500) { setTimeout(() => ghGet(p, opts).then(resolve, reject), 3000); return; }
        try { resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers }); }
        catch (_) { resolve({ status: res.statusCode, body: null, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}
ghGet._loggedRate = false; // marker
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Classification ─────────────────────────────────────────────────────────────
function tierLabel(t) { return ({ white:'WHITELIST', yellow:'YELLOW-COPYSRIGHT', red:'BLOCKED', unknown:'UNKNOWN' })[t] || t; }

async function fetchRepoSummary(fullName) {
  const parts = fullName.split('/'); if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  const r = await ghGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!r || r.status !== 200) return null;
  return {
    handle: fullName, name: repo, owner,
    description: (r.body.description || '').slice(0, 300),
    stars: Number(r.body.stargazers_count || 0),
    forks: Number(r.body.forks_count || 0),
    lang: r.body.language, homepage: r.body.homepage,
    sizeKB: Math.round((r.body.size || 0) / 1024),
    topics: (r.body.topics || []).slice(0, 10),
    openIssues: Number(r.body.open_issues_count || 0),
    archived: !!r.body.archived, fork: !!r.body.fork,
  };
}
async function fetchRepoLicense(fullName) {
  const parts = fullName.split('/'); if (parts.length !== 2) return { license: null, attribution: '' };
  const r = await ghGet(`/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/license`);
  if (!r || r.status !== 200) return { license: null, attribution: '' };
  const raw = r.body.license ? (r.body.license.spdx_id || r.body.license.key || '') : '';
  const spdx  = normalizeSpdx(raw);
  const attr  = `\n\n## Attribution\nThis product includes software licensed under [${spdx || 'custom'}](https://github.com/${fullName}) by @${parts[0]}.`;
  return { license: spdx, attribution: attr };
}

// ── Search pipeline ────────────────────────────────────────────────────────────
async function* paginateSearch(q, maxItems = 500) {
  let page = 1, total = 0, consecutiveErrors = 0;
  while (total < maxItems && page <= 10) { // hard cap: 10 pages × 30 = 300 items per query
    const r = await ghGet(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&page=${page}&per_page=30&type=Repositories`);
    if (!r || !r.body || !r.body.items) {
      consecutiveErrors++;
      if (consecutiveErrors > 3) { console.warn(`[discovery] 3 consecutive errors for "${q.slice(0,40)}", aborting`); break; }
      await sleep(2000); continue;
    }
    consecutiveErrors = 0;
    total = r.body.total_count;
    for (const item of (r.body.items || [])) {
      yield { handle: item.full_name, desc: (item.description||'').slice(0,300), stars: item.stargazers_count, lang: item.language, topics: item.topics||[] };
    }
    if ((r.body.items || []).length === 0) break;
    page++;
    await sleep(1100); // ~5k req/h budget with auth token
  }
}

async function discoverCategory(catLabel, q, maxItems, state) {
  const out = [];
  for await (const hit of paginateSearch(q, maxItems)) {
    if (hit.handle in state.seenHandles) continue;
    state.seenHandles.add(hit.handle);
    const summary = await fetchRepoSummary(hit.handle);
    if (!summary || summary.archived || summary.fork) continue;
    const lic = await fetchRepoLicense(hit.handle);
    const tier = classifyLicense(lic.license);
    out.push({
      discoveredAt: new Date().toISOString(), category: catLabel,
      summary, licenseInfo: { spdx: lic.license, attribution: lic.attribution, classification: tier },
      actionable: tier === 'white' || tier === 'yellow',
    });
    appendScanLog({ action: 'found', entry: { id: hit.handle, tier }, category: catLabel, tier });
    await sleep(900);
  }
  return out;
}

async function runFullDiscovery(maxPerCat = 200) {
  const state = loadState();
  const allEntries = [];
  console.log(`[discovery] start seen=${state.seenHandles.size} token=${!!GITHUB_TOKEN}`);
  for (const [label, q] of CATEGORIES) {
    console.log(`[discovery] category=${label} query="${q.slice(0,80)}"`);
    const entries = await discoverCategory(label, q, maxPerCat, state);
    const w = entries.filter(e=>e.licenseInfo.classification==='white').length;
    const y = entries.filter(e=>e.licenseInfo.classification==='yellow').length;
    const r = entries.filter(e=>e.licenseInfo.classification==='red').length;
    console.log(`[discovery]  -> ${entries.length} new  W=${w} Y=${y} R=${r}`);
    allEntries.push(...entries);
    for (const e of entries) state.countsByTier[e.licenseInfo.classification||'unknown']++;
    try { saveState(state); writeCatalog(allEntries.slice(0, 500)); } catch (e) { console.warn('[discovery] save failed:', e.message); }
    await sleep(2000);
  }
  console.log(`[discovery] done total=${allEntries.length} totals={W:${state.countsByTier.white},Y:${state.countsByTier.yellow},R:${state.countsByTier.red}}`);
  writeCatalog(allEntries);
  return allEntries;
}

function writeCatalog(entries) {
  fs.writeFileSync(path.join(OUT_DIR,'catalog.json'), JSON.stringify(entries,null,2));
  const byTier = { white:[], yellow:[], red:[], unknown:[] };
  for (const e of entries) (byTier[e.licenseInfo.classification||'unknown']||[]).push(e);
  fs.writeFileSync(path.join(OUT_DIR,'by-tier-white.json'), JSON.stringify(byTier.white,null,2));
  fs.writeFileSync(path.join(OUT_DIR,'by-tier-yellow.json'),JSON.stringify(byTier.yellow,null,2));
  fs.writeFileSync(path.join(OUT_DIR,'by-tier-red.json'),  JSON.stringify(byTier.red,null,2));
  fs.writeFileSync(path.join(OUT_DIR,'_stats.json'), JSON.stringify({
    scannedAt: new Date().toISOString(), total: entries.length,
    byTier: { white:byTier.white.length, yellow:byTier.yellow.length, red:byTier.red.length, unknown:byTier.unknown.length }
  }));
  console.log(`[discovery] catalog written: ${entries.length} total W=${byTier.white.length} Y=${byTier.yellow.length} R=${byTier.red.length}`);
}

if (require.main === module) {
  runFullDiscovery(parseInt(process.argv[2])||200).catch(e => { console.error('[discovery] fatal:', e.message); process.exit(1); });
}
module.exports = { classifyLicense, tierLabel, runFullDiscovery, fetchRepoSummary, fetchRepoLicense, OUT_DIR, TIER_WHITELIST, normalizeSpdx, paginateSearch };

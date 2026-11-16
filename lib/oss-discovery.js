// oss-discovery.js — GitHub-based open-source project discovery pipeline.
'use strict';
const https = require('https');
const path  = require('path');
const fs    = require('fs');
const GH_TOKEN_FILE = process.env.GITHUB_TOKEN_FILE || 'C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt';
let GITHUB_TOKEN;
try { GITHUB_TOKEN = fs.readFileSync(GH_TOKEN_FILE, 'utf8').trim(); } catch (_) {}
const TIER_WHITELIST = new Set(['mit','bsd-2-clause','bsd-3-clause','apache-2.0','isc','unlicense','0bsd','mpl-2.0','cc0-1.0']);
const TIER_YELLOW = new Set(['gpl-2.0','gpl-3.0','lgpl-2.1','lgpl-3.0','agpl-3.0','epl-1.0','epl-2.0','cddl-1.0']);
const TIER_RED = new Set(['cc-by-nc-4.0','cc-by-nc-sa-4.0','cc-by-nc-nd-4.0']);
const CATEGORIES = [
  ['cli-tools','language:shell OR language:bash org:xclipit'],
  ['dev-utilities','org:terrierscript language:js'],
  ['data-viz','language:python +language:javascript star:>1000 pushed:>2025-01-01'],
  ['ml-nlp','language:python stars:>5000 pushed:>2024-06-01 topic:transformers OR topic:llm OR topic:nlp'],
  ['security','topic:security language:go OR language:rust OR language:c stars:>500 pushed:>2024-01-01'],
  ['web-frameworks','language:typescript stars:>1000 pushed:>2025-01-01 -fork:true'],
  ['monitoring','topic:observability OR topic:monitoring language:go OR language:rust stars:>500 pushed:>2024-06-01'],
  ['infra-devops','org:hashicorp OR org:kubernetes OR org:grafana OR org:pomerium pushed:>2024-01-01'],
  ['media-processing','language:python topic:image OR topic:video OR topic:audio pushed:>2024-06-01 stars:>300'],
  ['finance-trading','topic:trading OR topic:defi OR topic:crypto OR topic:blockchain language:python OR language:rust stars:>200 pushed:>2024-09-01'],
  ['productivity','org:obsidianmd OR org:joplin OR org:outline pushed:>2024-01-01 stars:>100'],
];
const OUT_DIR   = path.join(__dirname, '..', 'data', 'oss-catalog');
const STATE_FILE = path.join(OUT_DIR, '_state.json');
const SCAN_LOG   = path.join(OUT_DIR, '_scan_log.jsonl');
fs.mkdirSync(OUT_DIR, { recursive: true });
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return { seenHandles: new Set(), lastScanTs: 0, countsByTier: { white:0, yellow:0, red:0, unknown:0 }, totalScanned: 0 }; } }
function saveState(s) { const dump = { ...s, seenHandles: Array.from(s.seenHandles) }; fs.writeFileSync(STATE_FILE, JSON.stringify(dump, null, 2)); }
function appendScanLog(entry) { try { fs.appendFileSync(SCAN_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8'); } catch (_) {} }
function ghGet(p) {
  const tok = GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}`, 'user-agent': 'autotasker-hub' } : { 'user-agent': 'autotasker-hub' };
  return new Promise((resolve, reject) => {
    const req = https.get(`https://api.github.com${p}`, { headers: tok }, (res) => {
      let body = ''; res.on('data', d => body += d); res.on('end', () => {
        if (res.statusCode === 403 && !GITHUB_TOKEN) { resolve(null); return; }
        if (res.statusCode >= 500) { setTimeout(() => ghGet(p).then(resolve, reject), 3000); return; }
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (_) { resolve({ status: res.statusCode, body: null }); }
      });
    });
    req.on('error', reject); req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function classifyLicense(name) {
  const n = (name||'').toLowerCase().replace(/\s/g,'-');
  if (!n || n.includes('no license') || n.includes('proprietary')) return 'red';
  if (TIER_WHITELIST.has(n)) return 'white';
  if (TIER_YELLOW.has(n)) return 'yellow';
  if (TIER_RED.has(n)) return 'red';
  if (n.includes('gpl')) return 'yellow';
  if (n.includes('agpl')) return 'yellow';
  if (n.includes('lgpl')) return 'yellow';
  if (n.includes('apache')) return 'white';
  if (n.includes('mit')) return 'white';
  if (n.includes('bsd')) return 'white';
  if (n.includes('isc')) return 'white';
  return 'unknown';
}
function tierLabel(t) { return ({ white:'WHITELIST', yellow:'YELLOW-COPYSRIGHT', red:'BLOCKED', unknown:'UNKNOWN' })[t] || t; }
async function fetchRepoSummary(fullName) {
  const parts = fullName.split('/'); if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  const r = await ghGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!r || r.status !== 200) return null;
  return { handle: fullName, name: repo, owner, description: (r.body.description||'').slice(0,300), stars: Number(r.body.stargazers_count||0), forks: Number(r.body.forks_count||0), lang: r.body.language, homepage: r.body.homepage, sizeKB: Math.round((r.body.size||0)/1024), topics: (r.body.topics||[]).slice(0,10), openIssues: Number(r.body.open_issues_count||0), archived: !!r.body.archived, fork: !!r.body.fork };
}
async function fetchRepoLicense(fullName) {
  const parts = fullName.split('/'); if (parts.length !== 2) return { license: null, attribution: '' };
  const r = await ghGet(`/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/license`);
  if (!r || r.status !== 200) return { license: null, attribution: '' };
  const spdx = r.body.license ? (r.body.license.spdx_id || r.body.license.key || '') : '';
  const attr = `\n\n## Attribution\nThis product includes software under [${spdx || 'custom'}](https://github.com/${fullName}) by @${parts[0]}.`;
  return { license: spdx, attribution: attr };
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
    out.push({ discoveredAt: new Date().toISOString(), category: catLabel, summary, licenseInfo: { spdx: lic.license, attribution: lic.attribution, classification: tier }, actionable: tier==='white' || tier==='yellow' });
    appendScanLog({ action: 'found', entry: { id: hit.handle, tier }, category: catLabel, tier });
    await sleep(900);
  }
  return out;
}
async function* paginateSearch(q, maxItems=500) {
  let page = 1, total = 0;
  while (total < maxItems) {
    const r = await ghGet(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&page=${page++}&per_page=30&type=Repositories`);
    if (!r || !r.body) break;
    total = r.body.total_count;
    for (const item of (r.body.items || [])) yield { handle: item.full_name, desc: (item.description||'').slice(0,300), stars: item.stargazers_count, lang: item.language, topics: item.topics||[] };
    if ((r.body.items||[]).length===0) break;
    if (r.rate && r.rate.remaining && Number(r.rate.remaining)<20) break;
    await sleep(1100);
  }
}
async function runFullDiscovery(maxPerCat=200) {
  const state = loadState();
  const allEntries = [];
  console.log(`[discovery] start seen=${state.seenHandles.size} budget=${GITHUB_TOKEN?'5000/h':'60/h'}`);
  for (const [label, q] of CATEGORIES) {
    console.log(`[discovery] ${label}`);
    const entries = await discoverCategory(label, q, maxPerCat, state);
    console.log(`[discovery] -> ${entries.length} new (W:${entries.filter(e=>e.licenseInfo.classification==='white').length} Y:${entries.filter(e=>e.licenseInfo.classification==='yellow').length} R:${entries.filter(e=>e.licenseInfo.classification==='red').length})`);
    allEntries.push(...entries);
    for (const e of entries) state.countsByTier[e.licenseInfo.classification||'unknown']++;
    try { saveState(state); writeCatalog(allEntries.slice(0,500)); } catch (e) { console.warn('[discovery] save failed:', e.message); }
    await sleep(2000);
  }
  console.log(`[discovery] done total=${allEntries.length} W=${state.countsByTier.white} Y=${state.countsByTier.yellow} R=${state.countsByTier.red}`);
  writeCatalog(allEntries);
  return allEntries;
}
function writeCatalog(entries) {
  fs.writeFileSync(path.join(OUT_DIR,'catalog.json'), JSON.stringify(entries,null,2));
  const byTier = { white:[], yellow:[], red:[], unknown:[] };
  for (const e of entries) (byTier[e.licenseInfo.classification||'unknown']||[]).push(e);
  fs.writeFileSync(path.join(OUT_DIR,'by-tier-white.json'), JSON.stringify(byTier.white,null,2));
  fs.writeFileSync(path.join(OUT_DIR,'by-tier-yellow.json'),JSON.stringify(byTier.yellow,null,2));
  fs.writeFileSync(path.join(OUT_DIR,'by-tier-red.json'), JSON.stringify(byTier.red,null,2));
  fs.writeFileSync(path.join(OUT_DIR,'_stats.json'), JSON.stringify({ scannedAt:new Date().toISOString(), total:entries.length, byTier:{ white:byTier.white.length,yellow:byTier.yellow.length,red:byTier.red.length,unknown:byTier.unknown.length }}));
  console.log(`[discovery] catalog written: ${entries.length} total W=${byTier.white.length} Y=${byTier.yellow.length} R=${byTier.red.length}`);
}
if (require.main === module) { runFullDiscovery(parseInt(process.argv[2])||200).catch(e => { console.error('fatal:', e.message); process.exit(1); }); }
module.exports = { classifyLicense, tierLabel, runFullDiscovery, fetchRepoSummary, fetchRepoLicense, OUT_DIR, TIER_WHITELIST };

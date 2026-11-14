/**
 * build-api-catalog.js — Build the master catalog of no-key free APIs from
 * public-apis-dev/public-apis (the ~1500-entry index), via the stable api.github.com raw channel.
 *
 * Output: data/api-catalog.json — every No-auth entry with category, plus our probe verdicts.
 * Usage: node scripts/build-api-catalog.js
 */
const fs = require('fs');
const path = require('path');

const REPO = 'public-apis-dev/public-apis';

(async () => {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/README.md`, {
    headers: { accept: 'application/vnd.github.v3.raw', 'user-agent': 'autotasker-hub' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`fetch readme: ${r.status}`);
  const readme = await r.text();
  console.log(`readme: ${readme.length} chars`);

  const lines = readme.split('\n');
  const entries = [];
  let category = null;
  for (const line of lines) {
    const h = line.match(/^#{3} (?!#)(.+)/); // ### Category
    if (h) { category = h[1].trim(); continue; }
    const m = line.match(/^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/);
    if (!m) continue;
    const [, name, url, desc, auth, https] = m;
    entries.push({
      category,
      name: name.trim(),
      url: url.trim(),
      description: desc.replace(/`/g, '').trim(),
      auth: auth.replace(/\[\[|\]\]/g, '').trim().toLowerCase(),
      https: https.trim(),
    });
  }

  const byAuth = {};
  for (const e of entries) byAuth[e.auth] = (byAuth[e.auth] || 0) + 1;
  const noAuth = entries.filter(e => e.auth === 'no');
  const byCatNoAuth = {};
  for (const e of noAuth) byCatNoAuth[e.category] = (byCatNoAuth[e.category] || 0) + 1;

  // merge probe verdicts
  let probed = [];
  try { probed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'probe-results.json'), 'utf8')); } catch (e) {}

  const out = {
    generatedAt: new Date().toISOString(),
    source: REPO,
    totalEntries: entries.length,
    authDistribution: byAuth,
    noAuthCount: noAuth.length,
    noAuthByCategory: byCatNoAuth,
    probeSummary: { ok: probed.filter(p => p.ok).length, total: probed.length },
    probeResults: probed,
    noAuthEntries: noAuth,
  };
  fs.writeFileSync(path.resolve(__dirname, '..', 'data', 'api-catalog.json'), JSON.stringify(out, null, 2));
  console.log(`total entries: ${entries.length}`);
  console.log(`auth distribution: ${JSON.stringify(byAuth)}`);
  console.log(`NO-KEY APIs: ${noAuth.length}`);
  console.log('no-key by category:', JSON.stringify(byCatNoAuth, null, 1));
  console.log('-> data/api-catalog.json');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

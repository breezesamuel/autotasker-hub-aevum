/**
 * smart-probe.js — Targeted reachability testing for highest-value API categories.
 * Focuses on: AI/Games/Dev/GeoGov/Sports/Entertainment/Science — our target buyer segments.
 * Uses api.github.com contents to avoid raw-file download issues.
 */
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

// Categories we care about most (ranked by agent demand / monetization potential)
const FOCUS_CATS = [
  'AI', 'Games & Comics', 'Development', 'Geocoding', 'Government',
  'Sports & Fitness', 'Entertainment', 'Books', 'Science & Math',
  'Cryptocurrency', 'Health', 'Transportation', 'Security', 'Finance',
  'Social', 'Video', 'Food & Drink', 'Animals', 'Art & Design', 'Dictionaries',
];

const COLD_CATS = [
  'Anti-Malware', 'Blockchain', 'Business', 'Calendar', 'Cloud Storage',
  'Continuous Integration', 'Currency Exchange', 'Data Validation',
  'Documents & Productivity', 'Email', 'Environment', 'Events',
  'Open Data', 'Open Source Projects', 'Patent', 'Personality', 'Phone',
  'Photography', 'Podcasts', 'Programming', 'Shopping', 'Text Analysis',
  'Tracking', 'URL Shorteners', 'Vehicle', 'Weather',
];

(async () => {
  // Fetch README via API (raw is slow/blocked)
  const r = await fetch('https://api.github.com/repos/public-apis-dev/public-apis/contents/README.md', {
    headers: { accept: 'application/vnd.github.v3.raw', 'user-agent': 'autotasker-hub' },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`fetch readme ${r.status}`);
  const readme = await r.text();

  const lines = readme.split('\n');
  const entries = [];
  let category = null;
  for (const line of lines) {
    const h = line.match(/^#{3} (?!#)(.+)/);
    if (h) { category = h[1].trim(); continue; }
    const m = line.match(/^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/);
    if (!m || m[4].replace(/\[\[|\]\]/g, '').trim().toLowerCase() !== 'no') continue;
    entries.push({
      category,
      name: m[1].trim(),
      url: m[2].trim(),
      description: m[3].replace(/`/g, '').trim(),
    });
  }
  console.log(`parsed total no-auth entries: ${entries.length}`);

  const focus = entries.filter(e => FOCUS_CATS.some(c => e.category.includes(c)));
  const cold = entries.filter(e => !FOCUS_CATS.some(c => e.category.includes(c)));
  console.log(`focus (${focus.length}): ${focus.map(e=>e.name).join(', ').slice(0,300)}`);

  // Smart ordering: pick ~50 best from focus + ~50 from cold
  function pick(list, n) {
    // shuffle deterministic
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, n);
  }

  const targets = [...pick(focus, 80), ...pick(cold, 60)];
  console.log(`\ntotal to probe: ${targets.length} (focus=${targets.filter(t=>FOCUS_CATS.some(c=>t.category.includes(c))).length}, cold=${targets.filter(t=>!FOCUS_CATS.some(c=>t.category.includes(c))).length})\n`);

  // Probe sequentially (avoid timeout chaos)
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${t.name} (${t.category})... `);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const start = Date.now();
      const resp = await fetch(t.url, {
        headers: { 'user-agent': UA, 'accept': 'application/json,text/html,*/*' },
        signal: ctrl.signal,
        redirect: 'manual',
        follow: 1,
      });
      clearTimeout(timer);
      const ms = Date.now() - start;
      const ct = resp.headers.get('content-type') || '';
      // For HTML pages, check title; for JSON just note it
      let verdict = 'ok';
      const txt = await resp.text();
      if (ct.includes('json')) verdict = 'json-ok';
      else if (/blocked|403|error/i.test(txt)) verdict = 'blocked';
      else if (resp.status === 200 || resp.status === 301 || resp.status === 302) verdict = 'reachable';
      else if (resp.status >= 400 && resp.status < 500) verdict = `client-error-${resp.status}`;
      else if (resp.status >= 500) verdict = `server-error-${resp.status}`;
      else verdict = `status-${resp.status}`;
      results.push({ category: t.category, name: t.name, url: t.url, status: resp.status, responseTimeMs: ms, verdict });
      console.log(`${resp.status} | ${verdict} | ${ms}ms`);
    } catch (e) {
      results.push({ category: t.category, name: t.name, url: t.url, status: 0, responseTimeMs: 0, verdict: 'failed', error: e.message.slice(0, 80) });
      console.log('FAILED:', e.message.slice(0, 60));
    }
    // Small throttle to be nice
    await new Promise(r => setTimeout(r, 150));
  }

  const ok = results.filter(r => ['ok', 'reachable', 'json-ok'].includes(r.verdict));
  const blocked = results.filter(r => r.verdict === 'blocked');
  const failed = results.filter(r => r.verdict === 'failed');
  console.log(`\n=== SUMMARY ===`);
  console.log(`total probed: ${results.length}`);
  console.log(`✅ reachable: ${ok.length}`);
  console.log(`❌ blocked: ${blocked.length} (${blocked.map(r=>r.name).join(', ').slice(0,120)})`);
  console.log(`⏱️  failed/timeouts: ${failed.length}`);
  console.log(`avg response time: ${Math.round(ok.reduce((a,b)=>a+b.responseTimeMs,0)/Math.max(ok.length,1))}ms`);

  // By category breakdown
  const byCat = {};
  for (const r of results) {
    if (!byCat[r.category]) byCat[r.category] = { ok: 0, fail: 0 };
    byCat[r.category][r.verdict === 'blocked' || r.verdict.startsWith('failed') || r.verdict.startsWith('error') ? 'fail' : 'ok']++;
  }
  console.log('\nby-category success rate:');
  Object.entries(byCat).sort((a, b) => b[1].fail - a[1].fail || b[1].ok - a[1].ok).forEach(([cat, v]) => {
    console.log(`  ${cat}: ${v.ok}/${v.ok+v.fail}`);
  });

  // Save everything
  fs.writeFileSync(path.resolve(__dirname, '..', 'data', 'probe-smart-results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.resolve(__dirname, '..', 'data', 'api-catalog.json'), JSON.stringify({ lastProbeAt: new Date().toISOString(), probeResults: results }, null, 2));
  console.log('\n-> data/probe-smart-results.json');
})();

/**
 * gh-probe.js — GitHub API probe: verify PAT, check grant issue, inspect target READMEs
 * Run: node scripts/gh-probe.js
 */
const TOKEN = process.env.GITHUB_TOKEN || require('fs').readFileSync(process.env.GITHUB_TOKEN_FILE || 'C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker-hub' };
const gh = (path, opts = {}) => fetch(`https://api.github.com${path}`, { headers: H, ...opts });

(async () => {
  // 1. Verify token identity + scopes
  const me = await gh('/user');
  const mj = await me.json();
  console.log(`=== AUTH (${me.status}) ===`);
  console.log(`login: ${mj.login} | name: ${mj.name} | public_repos: ${mj.public_repos}`);
  console.log(`scopes: ${me.headers.get('x-oauth-scopes') || '(default)'}`);

  // 2. Grant issue #4045 on x402-foundation/x402
  try {
    const ir = await gh('/repos/x402-foundation/x402/issues/4045');
    console.log(`\n=== x402-foundation/x402 issue 4045 (${ir.status}) ===`);
    if (ir.ok) {
      const ij = await ir.json();
      console.log(`title: ${ij.title}`);
      console.log(`state: ${ij.state} | comments: ${ij.comments} | labels: ${(ij.labels || []).map(l => l.name).join(',')}`);
      console.log(`body (first 700 chars):\n${(ij.body || '').slice(0, 700)}`);
    }
  } catch (e) { console.log('issue probe failed:', e.message.slice(0, 80)); }

  // 3. Verify target repos exist
  console.log('\n=== TARGET REPOS ===');
  for (const r of ['Recall-Kitchen/awesome-x402-mcp-services', 'xpaysh/awesome-x402', 'xpaysh/awesome-agentic-commerce']) {
    const rr = await gh(`/repos/${r}`);
    if (rr.ok) {
      const d = await rr.json();
      console.log(`OK  ${r} — branch: ${d.default_branch}, stars: ${d.stargazers_count}`);
    } else {
      console.log(`MISSING ${r} (${rr.status})`);
    }
  }

  // 4. Fetch awesome-x402-mcp-services README (full) — our top-priority listing
  const rm = await gh('/repos/Recall-Kitchen/awesome-x402-mcp-services/readme', { headers: { ...H, accept: 'application/vnd.github.v3.raw' } });
  if (rm.ok) {
    const txt = await rm.text();
    console.log(`\n=== awesome-x402-mcp-services README (${txt.length} chars) ===`);
    // Print section structure + the Business data / News sections fully
    const lines = txt.split('\n');
    lines.forEach((l, i) => { if (/^#{1,3} /.test(l)) console.log(`L${i + 1}: ${l}`); });
    const bd = lines.findIndex(l => /^### Business data/.test(l));
    if (bd >= 0) console.log(`\n--- Business data section ---\n${lines.slice(bd, bd + 20).join('\n')}`);
    const news = lines.findIndex(l => /^### News/.test(l));
    if (news >= 0) console.log(`\n--- News section ---\n${lines.slice(news, news + 15).join('\n')}`);
    // How to contribute?
    const ct = lines.findIndex(l => /contribut/i.test(l));
    if (ct >= 0) console.log(`\n--- Contributing section ---\n${lines.slice(ct, ct + 15).join('\n')}`);
  } else console.log('readme fetch failed', rm.status);

  // 5. Section headers of the other two lists
  for (const r of ['xpaysh/awesome-x402', 'xpaysh/awesome-agentic-commerce']) {
    const rr = await gh(`/repos/${r}/readme`, { headers: { ...H, accept: 'application/vnd.github.v3.raw' } });
    if (rr.ok) {
      const txt = await rr.text();
      console.log(`\n=== ${r} README headers (${txt.length} chars) ===`);
      txt.split('\n').forEach((l, i) => { if (/^#{1,3} /.test(l)) console.log(`L${i + 1}: ${l}`); });
    }
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

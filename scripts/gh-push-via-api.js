/**
 * gh-push-via-api.js — Push local commits to GitHub via the Git Data API
 * (bypasses the flaky github.com git-over-HTTPS endpoint; uses stable api.github.com).
 *
 * Pushes the CURRENT working tree state of selected files as a single new commit on main.
 * Usage: node scripts/gh-push-via-api.js "commit message" file1 file2 ...
 */

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN
  || fs.readFileSync(process.env.GITHUB_TOKEN_FILE || 'C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker-hub' };
const REPO = 'breezesamuel/autotasker-hub-aevum';
const gh = (p, o = {}) => fetch(`https://api.github.com/repos/${REPO}${p}`, { headers: H, ...o });

(async () => {
  const msg = process.argv[2] || 'update via API';
  const files = process.argv.slice(3);
  if (!files.length) { console.error('no files given'); process.exit(1); }

  // 1. current HEAD
  const ref = await (await gh('/git/ref/heads/main')).json();
  const headSha = ref.object.sha;
  console.log('head:', headSha);

  // 2. base tree
  const headCommit = await (await gh(`/git/commits/${headSha}`)).json();
  const baseTree = headCommit.tree.sha;

  // 3. blobs
  const tree = [];
  for (const f of files) {
    const abs = path.resolve(__dirname, '..', f);
    const content = fs.readFileSync(abs);
    const br = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }) });
    const bd = await br.json();
    if (!br.ok) throw new Error(`blob ${f}: ${br.status} ${JSON.stringify(bd).slice(0, 100)}`);
    tree.push({ path: f, mode: '100644', type: 'blob', sha: bd.sha });
    console.log(`blob: ${f} -> ${bd.sha.slice(0, 10)} (${content.length} bytes)`);
  }

  // 4. tree
  const tr = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) });
  const td = await tr.json();
  if (!tr.ok) throw new Error(`tree: ${tr.status} ${JSON.stringify(td).slice(0, 150)}`);
  console.log('tree:', td.sha);

  // 5. commit
  const cm = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: msg, tree: td.sha, parents: [headSha] }) });
  const cd = await cm.json();
  if (!cm.ok) throw new Error(`commit: ${cm.status} ${JSON.stringify(cd).slice(0, 150)}`);
  console.log('commit:', cd.sha);

  // 6. update ref (fast-forward; server HEAD must equal headSha)
  const ur = await gh('/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: cd.sha, force: false }) });
  if (!ur.ok) { console.log('ref update failed:', ur.status, (await ur.text()).slice(0, 200)); process.exit(1); }
  console.log('✅ pushed via API: main ->', cd.sha.slice(0, 10));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

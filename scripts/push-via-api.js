// push-via-api.js — push selected files via GitHub API (bypasses git protocol)
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN || fs.readFileSync(process.env.GITHUB_TOKEN_FILE || 'C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker-hub' };
const REPO = 'breezesamuel/autotasker-hub-aevum';
const gh = p => fetch(`https://api.github.com/repos/${REPO}${p}`, { headers: H });

(async () => {
  const msg = process.argv[2] || 'update via API';
  const files = process.argv.slice(3);
  if (!files.length) { console.error('no files given'); process.exit(1); }

  const ref = await (await gh('/git/ref/heads/main')).json();
  const headSha = ref.object.sha;
  const headCommit = await (await gh(`/git/commits/${headSha}`)).json();
  const baseTree = headCommit.tree.sha;

  const tree = [];
  for (const f of files) {
    const abs = path.resolve(__dirname, '..', f);
    const content = fs.readFileSync(abs);
    const br = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }) });
    const bd = await br.json();
    tree.push({ path: f, mode: '100644', type: 'blob', sha: bd.sha });
    console.log(`blob: ${f} -> ${bd.sha.slice(0,10)} (${content.length} bytes)`);
  }

  const tr = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) });
  const td = await tr.json();
  if (!tr.ok) throw new Error(`tree: ${tr.status} ${(await tr.text()).slice(0,150)}`);

  const cm = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: msg, tree: td.sha, parents: [headSha] }) });
  const cd = await cm.json();
  if (!cm.ok) throw new Error(`commit: ${cm.status} ${(await cm.text()).slice(0,150)}`);

  // Also update package.json in-tree
  const pkgPath = 'package.json';
  const pkgAbs = path.resolve(__dirname, '..', pkgPath);
  const pkgContent = fs.readFileSync(pkgAbs);
  const pkgBr = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: pkgContent.toString('base64'), encoding: 'base64' }) });
  const pkgBd = await pkgBr.json();

  // Update tree to include package.json change
  const allFiles = [...tree, { path: pkgPath, mode: '100644', type: 'blob', sha: pkgBd.sha }];
  const tr2 = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree: allFiles }) });
  const td2 = await tr2.json();
  if (!tr2.ok) { /* use original tree */ } else {
    const cm2 = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: msg + ' (with package.json)', tree: td2.sha, parents: [headSha] }) });
    const cd2 = await cm2.json();
    if (cm2.ok) await gh('/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: cd2.sha, force: false }) });
  }

  await gh('/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: cd.sha, force: false }) });
  console.log(`✅ pushed: main -> ${cd.sha.slice(0,10)}`);
})();

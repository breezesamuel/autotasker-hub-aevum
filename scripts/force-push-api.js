/**
 * force-push-via-api.js — Push current branch to remote using GitHub Git Data API.
 * Handles both additions AND deletions by building complete tree.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOKEN = process.env.GITHUB_TOKEN
  || fs.readFileSync(process.env.GITHUB_TOKEN_FILE || 'C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker-hub' };
const REPO = 'breezesamuel/autotasker-hub-aevum';
const gh = (p, o = {}) => fetch(`https://api.github.com/repos/${REPO}${p}`, { headers: H, ...o });

async function main() {
  const branch = process.argv[2] || 'main';
  const msg = process.argv[3] || 'force push via API';
  const localSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const remoteRef = await (await gh(`/git/ref/heads/${branch}`)).json();
  const remoteSha = remoteRef.object.sha;
  console.log(`Pushing ${localSha.slice(0,8)} → ${branch} (remote: ${remoteSha.slice(0,8)})`);
  if (remoteSha === localSha) { console.log('Already up-to-date'); return; }

  // Get all files in working tree
  const allFiles = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  console.log(`Total tracked files: ${allFiles.length}`);

  // Create blobs for all files
  const blobs = [];
  for (const f of allFiles) {
    const abs = path.resolve('.', f);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs);
    const br = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }) });
    const bd = await br.json();
    if (!br.ok) throw new Error(`blob ${f}: ${br.status} ${JSON.stringify(bd).slice(0, 100)}`);
    blobs.push({ path: f, sha: bd.sha, mode: '100644' });
  }

  // Build tree with parent from remote
  const tr = await gh('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ tree: blobs }),
  });
  const td = await tr.json();
  if (!tr.ok) throw new Error(`tree: ${tr.status} ${JSON.stringify(td).slice(0, 300)}`);
  console.log(`New tree: ${td.sha.slice(0,8)}`);

  // Create commit
  const cr = await gh('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message: msg, tree: td.sha, parents: [remoteSha] }),
  });
  const cd = await cr.json();
  if (!cr.ok) throw new Error(`commit: ${cr.status} ${JSON.stringify(cd).slice(0, 300)}`);
  console.log(`New commit: ${cd.sha.slice(0,8)}`);

  // Update ref with force
  const ur = await gh(`/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: cd.sha, force: true }),
  });
  const ud = await ur.json();
  if (!ur.ok) throw new Error(`update ref: ${ur.status} ${JSON.stringify(ud).slice(0, 300)}`);
  console.log(`✅ Branch ${branch} updated to ${cd.sha.slice(0,8)}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

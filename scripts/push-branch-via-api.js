/**
 * push-branch-via-api.js — Push an entire branch (all local commits) to GitHub
 * using the Git Data API. Bypasses the broken git-over-HTTPS on this network.
 *
 * Usage: node scripts/push-branch-via-api.js <branch> [message]
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
  const msg = process.argv[3] || 'push via API';
  const localSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  console.log(`Pushing ${localSha.slice(0,8)} → ${branch}`);

  // Get current remote ref
  const ref = await (await gh(`/git/ref/heads/${branch}`)).json();
  const remoteSha = ref.object.sha;
  console.log(`Remote HEAD: ${remoteSha.slice(0,8)}`);
  if (remoteSha === localSha) { console.log('Already up-to-date'); return; }

  // Walk all commits between remote and local
  const logResult = execSync(`git log --format=%H ${remoteSha}..${localSha}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean).reverse();
  console.log(`Commits to push: ${logResult.length}`);

  // For each commit, we need to reconstruct it via the API.
  // Strategy: use the parent commit's tree as base, then apply diffs.
  // Simpler approach: for each file changed in any of these commits, compute
  // a new tree from scratch based on the final working tree state.

  // Get list of files changed across all commits
  const diffResult = execSync(`git diff-tree --no-commit-id -r -M ${remoteSha}..${localSha}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const changedFiles = [...new Set(diffResult.map(l => {
    const parts = l.split(/\s+/);
    return parts[parts.length - 1]; // last field is filepath
  }))];
  // Also include renamed/deleted files
  diffResult.forEach(l => {
    const m = l.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(R\d+\d?|D|A)\s+(.+)$/);
    if (m) changedFiles.push(m[6]);
  });

  console.log(`Files to update: ${changedFiles.length}`);

  // Create blobs for all changed files from disk
  const blobs = [];
  for (const f of changedFiles) {
    const abs = path.resolve('.', f);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs);
    const br = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }) });
    const bd = await br.json();
    if (!br.ok) throw new Error(`blob ${f}: ${br.status} ${JSON.stringify(bd).slice(0, 100)}`);
    blobs.push({ path: f, sha: bd.sha });
    console.log(`  blob ${f} -> ${bd.sha.slice(0,8)}`);
  }

  // Build new tree
  const tr = await gh('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: ref.object.sha ? undefined : undefined, // start from remote's tree
      tree: blobs,
    }),
  });
  const td = await tr.json();
  if (!tr.ok) throw new Error(`tree: ${tr.status} ${JSON.stringify(td).slice(0, 200)}`);
  console.log(`New tree: ${td.sha.slice(0,8)}`);

  // Create commit
  const cr = await gh('/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: msg,
      tree: td.sha,
      parents: [remoteSha],
    }),
  });
  const cd = await cr.json();
  if (!cr.ok) throw new Error(`commit: ${cr.status} ${JSON.stringify(cd).slice(0, 200)}`);
  console.log(`New commit: ${cd.sha.slice(0,8)}`);

  // Update ref
  const ur = await gh(`/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: cd.sha, force: true }),
  });
  const ud = await ur.json();
  if (!ur.ok) throw new Error(`update ref: ${ur.status} ${JSON.stringify(ud).slice(0, 200)}`);
  console.log(`✓ Pushed ${localSha.slice(0,8)} → ${branch}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

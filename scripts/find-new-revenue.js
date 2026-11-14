/**
 * find-new-revenue-channels.js — Research additional monetization channels while waiting for deploy.
 * Targets: Grant programs, partnership opportunities, alternative hosting, API marketplace listings.
 */

const TOKEN = process.env.GITHUB_TOKEN || require('fs').readFileSync('C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker-hub' };
const gh = p => fetch(`https://api.github.com${p}`, { headers: H });

(async () => {
  // 1. x402 Foundation grant applications currently open
  console.log('\n=== x402 GRANT OPENINGS ===');
  const gi = await gh('/repos/x402-foundation/x402/issues?state=open&labels=grant&per_page=10');
  const gd = await gi.json();
  for (const i of (gd||[]).slice(0,5)) {
    console.log(`[#${i.number}] ${i.title}`);
    console.log(`   ${i.html_url} | comments:${i.comments} | created:${i.created_at.slice(0,10)}`);
  }

  // 2. Recent x402 ecosystem bounties on GitHub
  console.log('\n=== RECENT x402 BOUNTIES ===');
  const gs = await gh('/search/issues?q=x402+bounty+OR+x402+grant+in:title&sort=created&order=desc&per_page=8');
  const sd = await gs.json();
  for (const item of (sd.items||[]).slice(0,5)) {
    console.log(`[#${item.number}] ${item.repository_url.split('/').pop()} #${item.number}: ${item.title.slice(0,80)}`);
    console.log(`   ${item.html_url} | labels:${(item.labels||[]).map(l=>l.name).join(',')}`);
  }

  // 3. Coinbase CDP bounty/grant programs
  console.log('\n=== COINBASE DEV OPPORTUNITIES ===');
  const cdpr = await gh('/orgs/coinbase/repos?per_page=5&sort=updated');
  const cdpd = await cdpr.json();
  for (const repo of (cdpd||[]).slice(0,3)) {
    console.log(`${repo.full_name} — ${(repo.description||'').slice(0,100)}`);
    console.log(`   ${repo.html_url}`);
  }

  // 4. Check for active Superteam bounties with AGENT_ALLOWED
  console.log('\n=== SUPETeam Agent-Allowed Bounties ===');
  const sr = await fetch('https://earn.superteam.fun/api/listings?status=open&agentAccess=AGENT_ALLOWED&limit=10');
  const sd2 = await sr.json();
  for (const b of (sd2||[]).slice(0,5)) {
    const dl = b.deadline ? Math.ceil((new Date(b.deadline)-Date.now())/86400000) : '?';
    console.log(`[D+${dl}d] $${b.rewardAmount} ${b.token} — ${(b.title||'').slice(0,60)}`);
  }

  // 5. Search for x402-related repos that need contributors
  console.log('\n=== x402 REPOS NEEDING HELPERS ===');
  const xs = await gh('/search/repositories?q=x402+contributor+OR+help+wanted+OR+good+first+issue&sort=stars&order=desc&per_page=8');
  const xd = await xs.json();
  for (const r of (xd.items||[]).slice(0,5)) {
    console.log(`⭐${r.stargazers_count} ${r.full_name} — ${(r.description||'').slice(0,100)}`);
    console.log(`   ${r.html_url}`);
  }

  // 6. Check DoraHacks QDay page details
  console.log('\n=== DORAHACKS QDAY STATUS ===');
  try {
    const dr = await fetch('https://dorahacks.io/hackathon/qday', {headers:{'user-agent':'Mozilla/5.0'}});
    const dt = await dr.text();
    const title = (dt.match(/<title>([^<]+)<\/title>/i)||[])[1];
    const prize = (dt.match(/\$([\d,]+)/g)||[]).join(', ');
    console.log(`Title: ${title}`);
    console.log(`Prize mentions: ${prize}`);
  } catch(e) { console.log('DoraHacks fetch failed:', e.message.slice(0,50)); }

  // 7. Check x402 Slack / Discord community links
  console.log('\n=== COMMUNITY LINKS ===');
  const docs = await fetch('https://docs.x402.org/', {headers:{'user-agent':'Mozilla/5.0'}}, {timeout:8000});
  if(docs && docs.ok) {
    const txt = await docs.text();
    const slack = (txt.match(/slack\.x402\.org|discord\.gg\/x402/g)||[]);
    const twitter = (txt.match(/twitter\.com\/@[\w_]+|x\.com\/@[\w_]+/g)||[]);
    console.log(`Slack/Discord: ${slack.join(' | ')||'none found'}`);
    console.log(`Twitter: ${twitter.slice(0,3).join(' | ')||'none found'}`);
  }
})();

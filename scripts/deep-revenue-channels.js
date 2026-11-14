/**
 * deep-revenue-channels.js — Investigate highest-value revenue channels in parallel.
 */
const TOKEN = process.env.GITHUB_TOKEN || require('fs').readFileSync('C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker' };
const gh = p => fetch(`https://api.github.com${p}`, { headers: H });
const web = (url, opts={}) => fetch(url, { headers:{'user-agent':'Mozilla/5.0','accept':'text/html,application/json'}, ...opts, signal:AbortSignal.timeout(10000) });

(async () => {
  // ── 1. Coinbase AgentKit — Our biggest integration opportunity ──
  console.log('\n=== COINBASE AGENTKIT ===');
  try {
    const r = await gh('/repos/coinbase/agentkit');
    if (r.ok) {
      const d = await r.json();
      console.log(`Stars: ${d.stargazers_count} | Forks: ${d.forks_count}`);
      console.log(`Desc: ${(d.description||'').slice(0,150)}`);
      console.log(`Topics: ${(d.topics||[]).join(', ')}`);
      console.log(`URL: ${d.html_url}`);
      // Check README
      const rr = await fetch(d.readme_url, {headers:{'accept':'application/vnd.github.v3.raw'}});
      if (rr.ok) {
        const rd = await rr.text();
        const lines = rd.split('\n').filter(l=>l.trim()).slice(0,30);
        lines.forEach(l=>console.log(' '+l));
        const emails = [...new Set([...rd.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map(m=>m[0]))];
        if (emails.length) console.log('Contact:', emails.slice(0,3).join(', '));
      }
    }
  } catch(e) { console.log('AgentKit probe failed:', e.message.slice(0,60)); }

  // ── 2. Check Coinbase micro-grant #4040 ──
  console.log('\n=== COINBASE MICRO-GRANT #4040 ===');
  try {
    const ir = await gh('/repos/x402-foundation/x402/issues/4040');
    if (ir.ok) {
      const id = await ir.json();
      console.log(`Title: ${id.title}`);
      console.log(`State: ${id.state} | comments: ${id.comments}`);
      console.log(`Body (first 1000 chars):\n${(id.body||'').slice(0,1000)}`);
    }
  } catch(e) { console.log('Grant #4040 failed:', e.message.slice(0,60)); }

  // ── 3. Supeteam $500 x402 video bounty ──
  console.log('\n=== SUPETeam x402 Video Bounty ===');
  try {
    const sr = await fetch('https://earn.superteam.fun/api/listings/c4b303ec-66ad-417c-8ae4-b35300876387', {headers:{'Accept':'application/json'}});
    const sd = await sr.json();
    console.log(`Title: ${sd.title}`);
    console.log(`Reward: $${sd.rewardAmount} ${sd.token}`);
    console.log(`Deadline: ${sd.deadline}`);
    console.log(`Submissions: ${sd._count?.Submission||'?'}`);
    console.log(`Agent access: ${sd.agentAccess}`);
    console.log(`Description:\n${(sd.description||sd.description_md||'').slice(0,500)}`);
    console.log(`Link: https://earn.superteam.fun/listing/${sd.slug||sd.id}`);
  } catch(e) { console.log('Bounty probe failed:', e.message.slice(0,60)); }

  // ── 4. x402 Slack/Discord direct links ──
  console.log('\n=== X402 COMMUNITY LINKS ===');
  try {
    const dr = await web('https://docs.x402.org/community.md');
    if (dr.ok) {
      const dt = await dr.text();
      const slackLinks = [...dt.matchAll(/slack\.x402\.org[^"<\s]*/g)];
      const discordLinks = [...dt.matchAll(/discord\.gg\/[^"<\s]*/g)];
      console.log('Slack:', slackLinks.map(l=>l[0]).slice(0,3).join(' | '));
      console.log('Discord:', discordLinks.map(l=>l[0]).slice(0,3).join(' | '));
    }
  } catch(e) { console.log('Community links fetch failed'); }

  // ── 5. MCP marketplace listing opportunities ──
  console.log('\n=== MCP MARKETPLACE OPPORTUNITIES ===');
  const mcpSites = [
    { name:'Smithery', url:'https://smithery.ai/server/autotasker-hub' },
    { name:'MCP Store', url:'https://www.modelcontextprotocol.io/servers' },
    { name:'Glama MCP', url:'https://glama.ai/mcp/servers' },
  ];
  for (const s of mcpSites) {
    try {
      const r = await web(s.url, { redirect:'manual' });
      console.log(`${s.name}: HTTP ${r.status} (${r.redirected ? 'redirected:'+r.headers.get('location') : ''})`);
    } catch(e) { console.log(`${s.name}: ERR ${e.message.slice(0,40)}`); }
  }

  // ── 6. BAOBAO bounty re-check (was NG-only before) ──
  console.log('\n=== BAOBAO BOUNTY STATUS ===');
  try {
    const br = await fetch('https://earn.superteam.fun/api/listings/15ec1b70-443d-4ac3-8b69-786368c7c48e', {headers:{'Accept':'application/json'}});
    const bd = await br.json();
    console.log(`Title: ${bd.title}`);
    console.log(`Reward: ${bd.rewardAmount} ${bd.token}`);
    console.log(`Region restriction: ${bd.regionRestrictions||'none specified'}`);
    console.log(`Deadline: ${bd.deadline}`);
  } catch(e) { console.log('BAOBABAO check failed:', e.message.slice(0,40)); }

  // ── 7. Alternative hosting options (since Vercel may have issues) ──
  console.log('\n=== ALTERNATIVE HOSTING ===');
  const hosts = [
    { name:'Cloudflare Workers', url:'https://workers.cloudflare.com' },
    { name:'Render', url:'https://render.com' },
    { name:'Railway', url:'https://railway.app' },
    { name:'Fly.io', url:'https://fly.io' },
  ];
  for (const h of hosts) {
    try {
      const r = await web(h.url);
      console.log(`${h.name}: HTTP ${r.status} | ${(await r.text()).match(/<title>([^<]+)<\/title>/i)?.[1]||''}`);
    } catch(e) { console.log(`${h.name}: ERR ${e.message.slice(0,40)}`); }
  }
})();

/**
 * coinbase-agentkit-probe.js — Deep analysis of Coinbase AgentKit integration opportunity.
 * AgentKit = "Every AI Agent deserves a wallet" — if we integrate, our API becomes 
 * accessible to ALL AgentKit-powered agents automatically.
 */
const TOKEN = process.env.GITHUB_TOKEN || require('fs').readFileSync('C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker' };

(async () => {
  // 1. Full repo structure of agentkit
  console.log('=== COINBASE AGENTKIT REPO STRUCTURE ===');
  const mr = await fetch('https://api.github.com/repos/coinbase/agentkit/git/trees/main?recursive=1', { headers: H });
  const md = await mr.json();
  if (md.tree) {
    const dirs = [...new Set(md.tree.filter(t=>t.type==='tree').map(t=>t.path.split('/')[0]))];
    const jsFiles = md.tree.filter(t=>t.type==='blob' && t.path.match(/\.(js|ts)$/) && !t.path.includes('node_modules') && !t.path.includes('.test')).slice(0,40);
    console.log('Top-level dirs:', dirs.join(', '));
    console.log(`JS/TS files (excluding tests): ${jsFiles.length}`);
    jsFiles.forEach(f => console.log(`  ${f.path}`));
    
    // Check README
    const readmeFile = md.tree.find(t => t.path === 'README.md' && t.type === 'blob');
    if (readmeFile) {
      const rr = await fetch(`https://api.github.com/repos/coinbase/agentkit/contents/README.md`, { headers: { ...H, accept: 'application/vnd.github.v3.raw' }});
      if (rr.ok) {
        const rd = await rr.text();
        console.log('\n=== README KEY SECTIONS ===');
        const lines = rd.split('\n').filter(l=>l.trim()).slice(0,60);
        lines.forEach(l => console.log(l.slice(0,120)));
        
        // Find contact/install info
        const installCmd = rd.match(/npm install[^`]*`[^`]+`/g)?.slice(0,2);
        const discordSlack = [...rd.matchAll(/[Dd]iscord|[Ss]lack|[Cc]ontact|[Ee]mail|support/ig)].slice(0,3);
        if (installCmd?.length) console.log('Install:', installCmd.join(' | '));
        if (discordSlack.length) console.log('Comm:', discordSlack.map(m=>m[0]).join(', '));
      }
    }
  } else {
    console.log('Failed to get tree:', JSON.stringify(md).slice(0,200));
  }

  // 2. Check if AgentKit has x402 MCP server pattern
  console.log('\n=== SEARCHING FOR X402/MCP PATTERNS IN AGENTKIT ===');
  const patterns = ['x402', 'mcp', 'payment', '402', 'micropayment'];
  const relevantFiles = [];
  if (md.tree) {
    for (const file of md.tree) {
      if (file.type === 'blob' && file.path.endsWith('.md')) {
        // Just check path name, not content (too expensive)
        if (patterns.some(p => file.path.toLowerCase().includes(p))) {
          relevantFiles.push(file.path);
        }
      }
    }
  }
  console.log('Relevant files:', relevantFiles.slice(0,10).join(', ') || 'none found in paths');

  // 3. Check coinbase/agentic-wallet-skills
  console.log('\n=== COINBASE AGENTIC WALLET SKILLS ===');
  try {
    const ws = await fetch('https://api.github.com/repos/coinbase/agentic-wallet-skills', { headers: H });
    if (ws.ok) {
      const wd = await ws.json();
      console.log(`Stars: ${wd.stargazers_count} | Forks: ${wd.forks_count}`);
      console.log(`Desc: ${(wd.description||'').slice(0,150)}`);
      console.log(`Topics: ${(wd.topics||[]).join(', ')}`);
      console.log(`URL: ${wd.html_url}`);
    }
  } catch(e) { console.log('Agentic wallet skills probe failed'); }

  // 4. Check x402-foundation org for other repos
  console.log('\n=== X402 FOUNDATION ORG REPOS ===');
  try {
    const org = await fetch('https://api.github.com/orgs/x402-foundation/repos?per_page=20&sort=stars', { headers: H });
    if (org.ok) {
      const od = await org.json();
      for (const r of od.slice(0,10)) {
        console.log(`⭐${r.stargazers_count} ${r.name}: ${(r.description||'').slice(0,100)}`);
      }
    }
  } catch(e) { console.log('Org repos probe failed'); }

  // 5. Check Glama MCP for auto-listing capability
  console.log('\n=== GLAMA MCP DIRECTORY ===');
  try {
    const gr = await fetch('https://glama.ai/mcp/servers', { headers: {'user-agent':'Mozilla/5.0'} });
    if (gr.ok) {
      const gt = await gr.text();
      const links = [...gt.matchAll(/href="([^"]*server[^"]*)"/g)];
      console.log(`Found ${links.length} server links in directory`);
      console.log('Sample:', links.slice(0,5).map(l=>l[1]).join('\n  '));
    }
  } catch(e) { console.log('Glama probe failed:', e.message.slice(0,50)); }
})();

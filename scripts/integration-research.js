// Quick integration research for highest-value next steps
const TOKEN = process.env.GITHUB_TOKEN || require('fs').readFileSync('C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker' };

(async () => {
  // 1. Check if AgentKit has action provider template / how to contribute
  console.log('=== AGENTKIT ACTION PROVIDER TEMPLATE ===');
  try {
    const ctx = await fetch('https://api.github.com/repos/coinbase/agentkit/contents/typescript/agentkit/src/action-providers', { headers: H });
    const cd = await ctx.json();
    if (cd && Array.isArray(cd)) {
      for (const item of cd) {
        if (item.type === 'dir') console.log(`  📁 ${item.name}/`);
      }
    }
    // Get one example action provider structure
    const ex = await fetch('https://api.github.com/repos/coinbase/agentkit/contents/typescript/agentkit/src/action-providers/cdp', { headers: H });
    const ed = await ex.json();
    if (ed && Array.isArray(ed)) {
      console.log('\n  CDP Action Provider files:');
      for (const f of ed) console.log(`    ${f.type==='dir'?'📁':'📄'} ${f.name}`);
    }
  } catch(e) { console.log('AgentKit structure probe failed:', e.message.slice(0,60)); }

  // 2. Glama MCP — how to add our server
  console.log('\n=== GLAMA MCP ADD PROCESS ===');
  try {
    const gr = await fetch('https://glama.ai/mcp/servers/add', { headers: {'user-agent':'Mozilla/5.0','accept':'text/html'} });
    const gt = await gr.text();
    const title = (gt.match(/<title>([^<]+)<\/title>/i)||[])[1];
    console.log(`Title: ${title}`);
    // Look for form fields or instructions
    const forms = gt.match(/<form[^>]*>[\s\S]*?<\/form>/gi)?.[0]?.slice(0,500) || 'no form found';
    console.log(`Form preview: ${forms.slice(0,300)}`);
  } catch(e) { console.log('Glama probe failed'); }

  // 3. Check if our current Vercel deployment URL resolves from any source
  console.log('\n=== VERCEL URL RESOLUTION CHECK ===');
  const testUrls = [
    'https://autotasker-hub.vercel.app/',
    'https://autotasker-kyn9q3c2c-solmount.vercel.app/',
  ];
  for (const u of testUrls) {
    try {
      const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      console.log(`${u} -> HTTP ${r.status} (redirect:${r.headers.get('location')||'none'})`);
    } catch(e) {
      // DNS or connection error means domain doesn't exist yet
      console.log(`${u} -> UNREACHABLE (${e.message.slice(0,40)})`);
    }
  }

  // 4. Research: what MCP servers cost to list on Glama
  console.log('\n=== MCP MARKETPLACE PRICING ===');
  try {
    const mr = await fetch('https://glama.ai/pricing', { headers: {'user-agent':'Mozilla/5.0'} });
    const mt = await mr.text();
    const prices = mt.match(/\$[\d,]+/g)?.slice(0,5) || [];
    console.log(`Pricing mentions: ${prices.join(', ')||'no pricing found'}`);
  } catch(e) { console.log('Pricing probe failed'); }

  // 5. Search for "MCP server submission" guidelines  
  console.log('\n=== MCP SERVER SUBMISSION GUIDELINES ===');
  try {
    const sr = await fetch('https://smithery.ai/docs/contributing', { headers: {'user-agent':'Mozilla/5.0'} });
    const st = await sr.text();
    const relevant = st.match(/submit|add.*server|contribute|register/gi)?.length || 0;
    console.log(`Smithery contributing page: ${sr.status}, keywords found: ${relevant}`);
    console.log(st.slice(0,500).replace(/\n/g,' | '));
  } catch(e) { console.log('Smithery probe failed'); }
})();

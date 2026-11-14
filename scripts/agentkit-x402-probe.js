/**
 * agentkit-x402-probe.js — Analyze Coinbase AgentKit's x402 action provider 
 * and figure out how to add AutoTasker Hub as a custom provider.
 */
const TOKEN = process.env.GITHUB_TOKEN || require('fs').readFileSync('C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json' };
const gh = p => fetch(`https://api.github.com/repos/coinbase/agentkit${p}`, { headers: H });

(async () => {
  // 1. x402 action provider code
  console.log('=== AGENTKIT X402 ACTION PROVIDER ===');
  try {
    const files = await gh('/contents/typescript/agentkit/src/action-providers/x402');
    if (files.ok) {
      const fd = await files.json();
      if (Array.isArray(fd)) {
        for (const f of fd) {
          console.log(`  ${f.type==='dir'?'📁':'📄'} ${f.name}`);
          if (f.type === 'blob' && f.name.endsWith('.ts') && !f.name.includes('test')) {
            const cf = await gh(`/contents/${f.path}`);
            if (cf.ok) {
              const cd = await cf.json();
              const src = Buffer.from(cd.content, 'base64').toString('utf8');
              console.log(`\n  --- ${f.name} (${src.length} chars) ---`);
              const lines = src.split('\n').filter(l=>l.trim()).slice(0,40);
              lines.forEach(l => console.log('    '+l.slice(0,100)));
            }
          }
        }
      }
    } else {
      console.log('x402 dir not found or not accessible:', files.status);
    }
  } catch(e) { console.log('x402 probe failed:', e.message.slice(0,60)); }

  // 2. DefiLlama action provider (we use DefiLlama data — see if there's a pattern)
  console.log('\n=== AGENTKIT DEFLILLA ACTION PROVIDER ===');
  try {
    const df = await gh('/contents/typescript/agentkit/src/action-providers/defillama');
    if (df.ok) {
      const dd = await df.json();
      if (Array.isArray(dd)) {
        for (const f of dd) {
          if (f.type === 'blob' && !f.name.includes('test')) {
            const cf = await gh(`/contents/${f.path}`);
            if (cf.ok) {
              const cd = await cf.json();
              const src = Buffer.from(cd.content, 'base64').toString('utf8');
              console.log(`  ${f.name}: ${src.length} chars`);
              const lines = src.split('\n').filter(l=>l.trim()).slice(0,30);
              lines.forEach(l => console.log('    '+l.slice(0,100)));
            }
          }
        }
      }
    }
  } catch(e) { console.log('DefiLlama probe failed:', e.message.slice(0,40)); }

  // 3. Action provider base class (the template we'd follow)
  console.log('\n=== ACTION PROVIDER BASE CLASS ===');
  try {
    const bf = await gh('/contents/typescript/agentkit/src/action-providers/actionProvider.ts');
    if (bf.ok) {
      const bd = await bf.json();
      const src = Buffer.from(bd.content, 'base64').toString('utf8');
      const lines = src.split('\n').filter(l=>l.trim()).slice(0,50);
      lines.forEach(l => console.log('  '+l.slice(0,100)));
    }
  } catch(e) { console.log('Base class probe failed'); }

  // 4. CDP schema pattern (most similar to what we need)
  console.log('\n=== CDP ACTION PROVIDER (reference pattern) ===');
  try {
    const sf = await gh('/contents/typescript/agentkit/src/action-providers/cdp/schemas.ts');
    if (sf.ok) {
      const sd = await sf.json();
      const src = Buffer.from(sd.content, 'base64').toString('utf8');
      const lines = src.split('\n').filter(l=>l.trim()).slice(0,30);
      lines.forEach(l => console.log('  '+l.slice(0,100)));
    }
  } catch(e) { console.log('Schema probe failed'); }
})();

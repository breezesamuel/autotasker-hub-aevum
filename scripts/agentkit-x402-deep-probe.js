/**
 * agentkit-x402-deep-probe.js — Read ALL source files in the x402 action provider
 * to understand exactly how to build an AutoTasker Hub integration.
 */
const TOKEN = process.env.GITHUB_TOKEN || require('fs').readFileSync('C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json' };
const gh = p => fetch(`https://api.github.com/repos/coinbase/agentkit${p}`, { headers: H });

async function getRaw(path) {
  const r = await gh(`/contents/${path}`);
  if (!r.ok) return null;
  const d = await r.json();
  return Buffer.from(d.content, 'base64').toString('utf8');
}

(async () => {
  console.log('=== AGENTKIT X402 ACTION PROVIDER — FULL SOURCE ===\n');
  
  // Read all non-test .ts files
  const files = [
    'typescript/agentkit/src/action-providers/x402/index.ts',
    'typescript/agentkit/src/action-providers/x402/constants.ts',
    'typescript/agentkit/src/action-providers/x402/schemas.ts',
    'typescript/agentkit/src/action-providers/x402/utils.ts',
    'typescript/agentkit/src/action-providers/x402/x402ActionProvider.ts',
    'typescript/agentkit/src/action-providers/x402/README.md',
  ];
  
  for (const f of files) {
    const src = await getRaw(f);
    if (!src) { console.log(`SKIP: ${f} (not found)`); continue; }
    console.log(`\n===== ${f.split('/').pop()} =====`);
    const lines = src.split('\n').filter(l => l.trim());
    for (const l of lines.slice(0, 60)) console.log(l.slice(0,120));
    if (lines.length > 60) console.log(`... (${lines.length - 60} more lines)`);
  }

  // Also check the main index.ts to see how action providers are registered
  console.log('\n\n===== MAIN INDEX (action provider exports) =====');
  const idx = await getRaw('typescript/agentkit/src/index.ts');
  if (idx) {
    const lines = idx.split('\n').filter(l => l.includes('x402') || l.includes('X402') || l.includes('defillama') || l.includes('DefiLlama'));
    lines.forEach(l => console.log(l.slice(0, 120)));
  }

  // Check CONTRIBUTING.md for how to add new action providers
  console.log('\n===== CONTRIBUTING GUIDE =====');
  const cm = await getRaw('CONTRIBUTING.md');
  if (cm) {
    const lines = cm.split('\n').filter(l => l.trim());
    for (const l of lines.slice(0, 40)) console.log(l.slice(0, 120));
  }
})();

/**
 * gh-submit-listings.js — Submit AutoTasker Hub to curated x402 lists via GitHub API.
 *
 * Modes:
 *   node scripts/gh-submit-listings.js --check    Probe the live deployment (must pass before --submit)
 *   node scripts/gh-submit-listings.js --submit   Fork + edit README + open PRs (2 listings)
 *
 * Token: env GITHUB_TOKEN, or %TEMP%/opencode/gh_token.txt
 */

const fs = require('fs');

const TOKEN = process.env.GITHUB_TOKEN
  || fs.readFileSync(process.env.GITHUB_TOKEN_FILE || 'C:/Users/Think/AppData/Local/Temp/opencode/gh_token.txt', 'utf8').trim();
const H = { 'Authorization': `Bearer ${TOKEN}`, 'accept': 'application/vnd.github+json', 'user-agent': 'autotasker-hub' };
const gh = (p, o = {}) => fetch(`https://api.github.com${p}`, { headers: H, ...o });

const LIVE_BASE = 'https://autotasker-hub.vercel.app';
const USER = 'breezesamuel';

const TARGETS = [
  {
    key: 'mcp-services',
    repo: 'Recall-Kitchen/awesome-x402-mcp-services',
    // insert BEFORE the "Landing en 24h" bullet to keep alphabetical order
    anchor: '\n* [Landing en 24h',
    position: 'before',
    entry: `* [AutoTasker Hub](${LIVE_BASE}) — Chinese social media trending data for agents: Weibo hot search, Bilibili hot ranking and hot search terms, Toutiao hot board (fresh pull, refresh script ships with the repo). Hosted MCP at \`${LIVE_BASE}/mcp\` (streamable HTTP, no key); \`initialize\`, \`tools/list\` and a \`sample_free\` tool are free. Unpaid paid-tool calls (\`get_hotlist\` $0.05, \`search_chinese_social\` $0.05, \`get_price_intel\` $0.10, \`export_full_dataset\` $0.50) return HTTP 402 with x402 accepts (USDC on Base Sepolia or Solana Devnet); sign the payment and retry in the call \`_meta\`. [Discovery](${LIVE_BASE}/.well-known/x402) · [Source](https://github.com/${USER}/autotasker-hub-aevum)`,
    prTitle: 'Add AutoTasker Hub — Chinese social media trending data MCP (x402, USDC)',
    prBody: `## Service: AutoTasker Hub

- **Hosted MCP URL**: ${LIVE_BASE}/mcp (streamable HTTP, no key)
- **Free**: \`initialize\`, \`tools/list\`, \`sample_free\` tool
- **Paid**: \`get_hotlist\` ($0.05), \`search_chinese_social\` ($0.05), \`get_price_intel\` ($0.10), \`export_full_dataset\` ($0.50) — USDC via x402
- **Networks**: Base Sepolia (eip155:84532) + Solana Devnet (upgradeable to Base mainnet via env)
- **PayTo**: 0x74a9f91763c28571af7a52987f425f62825cf5d8
- **Source**: https://github.com/${USER}/autotasker-hub-aevum
- **Discovery doc**: ${LIVE_BASE}/.well-known/x402

### How an unpaid call produces 402
\`\`\`
POST /mcp  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_hotlist","arguments":{"board":"weiboHot"}}}
→ HTTP 402
{"jsonrpc":"2.0","result":{"structuredContent":{"paymentRequired":{"x402Version":2,"accepts":[{"scheme":"exact","network":"eip155:84532","amount":"50000",...}]}}}}
\`\`\`
REST routes equally return HTTP 402 with a PAYMENT-REQUIRED header via the official @x402/express middleware.

### What makes it a real product
Live Chinese trending data (Weibo / Bilibili / Toutiao) that is hard for agents outside China to source — refreshed by \`scripts/refresh-pack.js\` (ships in the repo). One job an agent would hire this for: "what is trending in China right now".`,
  },
  {
    key: 'awesome-x402',
    repo: 'xpaysh/awesome-x402',
    anchor: '### API Examples\n',
    position: 'after',
    entry: `- [AutoTasker Hub](https://github.com/${USER}/autotasker-hub-aevum) - China social-media data marketplace for AI agents: MCP + REST endpoints serving live Weibo/Bilibili/Toutiao trending data, paid per call in USDC via the official @x402/express SDK (HTTP 402 + MCP payment errors), with an on-chain commission-router settlement contract. Live at ${LIVE_BASE}.`,
    prTitle: 'Add AutoTasker Hub — China social data API (x402 + MCP, USDC)',
    prBody: `Adds AutoTasker Hub to **Example Applications → API Examples** per the contribution format \`[Resource Name](link) - Description.\`

- Repo: https://github.com/${USER}/autotasker-hub-aevum
- Live: ${LIVE_BASE} (MCP at /mcp; REST 402 at /api/x402/*)
- Official SDKs: @x402/express, @x402/core, @x402/evm, @x402/svm
- Free preview: \`POST /mcp tools/call name=sample_free\` or \`GET /api/x402/sample\`
- Paid: $0.05–$0.50 USDC per call (x402, Base Sepolia / Solana Devnet)`,
  },
];

async function check() {
  console.log('=== LIVE DEPLOYMENT CHECK ===');
  let pass = true;
  try {
    const r = await fetch(`${LIVE_BASE}/api/status`);
    console.log(`GET /api/status -> ${r.status}`);
    pass = pass && r.status === 200;
  } catch (e) { console.log('GET /api/status FAILED:', e.message.slice(0, 80)); pass = false; }

  try {
    const r = await fetch(`${LIVE_BASE}/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    const b = await r.json().catch(() => null);
    console.log(`POST /mcp initialize -> ${r.status} (server: ${b?.result?.serverInfo?.name || '?'})`);
    pass = pass && r.status === 200 && !!b?.result?.serverInfo;
  } catch (e) { console.log('initialize FAILED:', e.message.slice(0, 80)); pass = false; }

  try {
    const r = await fetch(`${LIVE_BASE}/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_hotlist', arguments: { board: 'weiboHot' } } }),
    });
    const b = await r.json().catch(() => null);
    const accepts = b?.result?.structuredContent?.paymentRequired?.accepts;
    console.log(`POST /mcp unpaid tools/call -> ${r.status}, has accepts: ${!!accepts}`);
    pass = pass && r.status === 402 && !!accepts;
  } catch (e) { console.log('unpaid call FAILED:', e.message.slice(0, 80)); pass = false; }

  console.log(pass ? '\nALL CHECKS PASS — run with --submit to open PRs' : '\nCHECKS FAILED — do not submit yet');
  return pass;
}

async function getReadme(repo, ref) {
  const r = await gh(`/repos/${repo}/contents/README.md?ref=${ref}`);
  if (!r.ok) throw new Error(`readme fetch ${r.status}`);
  const d = await r.json();
  return { sha: d.sha, content: Buffer.from(d.content, 'base64').toString('utf8') };
}

async function submitOne(t) {
  console.log(`\n=== ${t.repo} ===`);
  // 1. fork
  const fr = await gh(`/repos/${t.repo}/forks`, { method: 'POST' });
  const fd = await fr.json();
  const forkFull = fd.full_name || `${USER}/${t.repo.split('/')[1]}`;
  console.log(`fork: ${fr.status} -> ${forkFull} (default branch: ${fd.default_branch})`);
  const ref = fd.default_branch || 'main';

  // 2. readme from fork
  const { sha, content } = await getReadme(forkFull, ref);
  let next;
  if (t.position === 'before') {
    const i = content.indexOf(t.anchor);
    if (i < 0) throw new Error('anchor not found: ' + t.anchor.slice(0, 40));
    next = content.slice(0, i) + t.entry + content.slice(i);
  } else {
    const i = content.indexOf(t.anchor);
    if (i < 0) throw new Error('anchor not found: ' + t.anchor.slice(0, 40));
    const j = i + t.anchor.length;
    next = content.slice(0, j) + '\n' + t.entry + '\n' + content.slice(j);
  }

  // 3. commit to fork
  const pr = await gh(`/repos/${forkFull}/contents/README.md`, {
    method: 'PUT',
    body: JSON.stringify({
      message: t.prTitle,
      content: Buffer.from(next, 'utf8').toString('base64'),
      sha,
      branch: ref,
    }),
  });
  console.log(`readme commit: ${pr.status}`);
  if (!pr.ok) { console.log(await pr.text()); return; }

  // 4. open PR
  await new Promise(res => setTimeout(res, 0));
  const prr = await gh(`/repos/${t.repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title: t.prTitle, body: t.prBody, head: `${USER}:${ref}`, base: ref }),
  });
  const prd = await prr.json();
  console.log(`PR: ${prr.status} -> ${prd.html_url || JSON.stringify(prd).slice(0, 200)}`);
}

(async () => {
  const mode = process.argv[2] || '--check';
  if (mode === '--check') { await check(); return; }
  if (mode === '--submit') {
    const ok = await check();
    if (!ok) { console.log('refusing to submit — fix deployment first'); process.exit(1); }
    for (const t of TARGETS) {
      try { await submitOne(t); } catch (e) { console.log(`SUBMIT FAILED ${t.key}: ${e.message.slice(0, 150)}`); }
    }
    return;
  }
  console.log('usage: node scripts/gh-submit-listings.js --check | --submit');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

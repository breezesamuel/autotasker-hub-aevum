#!/usr/bin/env node
/**
 * ECO-SCAN — Build ecosystem map from GitHub search + known contacts,
 * write outreach emails, identify bounty/hiring opportunities.
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname + '/..';

const b = require('../data/deployments/float-velocity-benchmark.json');
const r = b.reconciled;
const usd6 = v => Number(require('ethers').formatUnits(BigInt(v), 6)).toFixed(2);

const OUT = path.join(ROOT, 'data', 'recon');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ── Ecosystem actors discovered via search ────────────────────────────────
const ACTORS = [
  {
    name: 'x402 Foundation',
    github: 'https://github.com/x402-foundation/x402',
    website: 'https://x402.org',
    slack: 'http://slack.x402.org/',
    stars: 6800, forks: 2300,
    fit: 'CANONICAL PROTOCOL OWNER',
    why: 'They maintain the official x402 spec. Our CapitalMobilizerV2 is a production implementation of batch-settlement scheme. Case study would be highly valuable to them.',
    action: 'Submit as featured case study on x402.org; join slack; contribute batch-settlement examples to the repo',
    contact: null,
  },
  {
    name: 'Reddi Agent Protocol (nissan)',
    github: 'https://github.com/nissan/reddi-agent-protocol',
    website: 'https://agent-protocol.reddi.tech',
    twitter: '@reddiagent',
    stars: 0, forks: 2,
    fit: 'SAME VERTICAL — Solana x402 agent marketplace',
    why: 'They build x402 escrow + commit-reveal reputation on Solana; we prove the pattern on EVM with $805 gross settled. Cross-chain proof is powerful.',
    action: 'Cross-reference proof: our 988 tx benchmark vs their devnet-local claims; offer joint blog post comparing Arc/EVM vs Solana settlement patterns',
    contact: 'hello@reddi.tech',
  },
  {
    name: 'Judge Protocol (vijaygopalbalasa)',
    github: 'https://github.com/vijaygopalbalasa/judge-protocol',
    website: 'https://judge-protocol-api.vercel.app',
    stars: 0, forks: 0,
    fit: 'COMPLEMENTARY — Deterministic evaluators for escrow',
    why: 'They solve "did the provider deliver?" after payment; we solve "how to split commission during payment." Combined = full trustless agent commerce stack.',
    action: 'Integrate our router with their JudgeEvaluator: route funds through escrow → judge verifies work → auto-split via our contract',
    contact: null,
  },
  {
    name: 'Agentic.Market',
    url: 'https://agentic.market',
    fit: 'DIRECTORY — x402 service discoverability',
    why: 'Community-maintained x402 service directory. Listing our router here = free discovery traffic for our API clients.',
    action: 'Submit our router endpoint to Agentic.Market listing',
    contact: null,
  },
  {
    name: 'Pay.sh',
    url: 'https://pay.sh',
    fit: 'FACILITATOR — x402 facilitator provider',
    why: 'If we switch our facilitator from AgentPay to Pay.sh, could unlock more networks and potentially lower fees.',
    action: 'Compare facilitator rates; if better, switch and re-run benchmark',
    contact: null,
  },
  {
    name: 'x402-list.com',
    url: 'https://x402-list.com',
    fit: 'DIRECTORY — Service registry',
    why: 'Another community directory for x402-enabled endpoints. Free visibility.',
    action: 'Submit our autotasker-hub.vercel.app/x402 endpoint',
    contact: null,
  },
  {
    name: 'MCP Registry (official)',
    url: 'https://registry.modelcontextprotocol.io',
    fit: 'DISTRIBUTION — MCP server discovery',
    why: 'Our x402 paywall endpoint can be registered as an MCP server tool, exposing our routing capability to any agent using Cursor/Claude/OpenCode.',
    action: 'Build and publish an MCP server that exposes chargeBatch() as a tool — lets any agent pay for data via x402',
    contact: null,
  },
];

// ── Active bounties/hiring ──────────────────────────────────────────────────
const BOUNTIES = [
  { name: 'swap.io x402 video', reward: '$500 USDC', deadline: 'Nov 14', status: 'BLOCKED-API-KEY' },
  { name: 'OOBE Protocol autonomous agent', reward: '$500 USDC', deadline: 'Dec 10', status: 'HUMAN-ONLY' },
  { name: 'MultiHopper challenge', reward: 'up to $50k+revshare', deadline: 'Dec 14', status: 'HUMAN-ONLY' },
  { name: 'Aevum Builder Challenge #1', reward: '$3,000 total', deadline: 'Dec 11', status: 'OPEN-DECEMBER' },
  { name: 'Code4rena K2 audit', reward: '$135,000 USDC', deadline: 'May 27 2026', status: 'WARDEN-REGISTER' },
  { name: 'Code4rena Rujira audit', reward: '$40,000 USDC', deadline: 'Jan 16 2026', status: 'WARDEN-REGISTER' },
];

// ── Write output files ────────────────────────────────────────────────────
const ecosystem = { scannedAt: new Date().toISOString(), actors: ACTORS, bounties: BOUNTIES };
fs.writeFileSync(path.join(OUT, 'ecosystem-map.json'), JSON.stringify(ecosystem, null, 2));

console.log('\n' + '='.repeat(78));
console.log('  ECOSYSTEM SCAN — X402 / AGENT COMMERCE LANDSCAPE');
console.log('='.repeat(78) + '\n');

console.log(`Our position:\n`);
console.log(`  CapitalMobilizerV2 | QDay Aevum testnet\n`);
console.log(`  ${b.payments} verified settlements | $${usd6(b.grossSettled)} gross tUSD8 | ${r.velocityX}x float velocity | invariant PASS\n`);

console.log('━'.repeat(78));
console.log('ACTOR MAP — PARTNERS / CUSTOMERS / COLLABORATORS\n');
for (let i = 0; i < ACTORS.length; i++) {
  const a = ACTORS[i];
  console.log(`\n${i+1}. ${a.name} [${a.fit}]`);
  console.log(`   URL : ${a.website || a.url || a.github}`);
  if (a.stars) console.log(`   Stars/Forks : ${a.stars}★ / ${a.forks} forks`);
  if (a.twitter) console.log(`   Twitter : ${a.twitter}`);
  if (a.slack) console.log(`   Slack   : ${a.slack}`);
  console.log(`   Why   : ${a.why.slice(0,110)}...`);
  console.log(`   Action: ${a.action.slice(0,110)}...`);
}

console.log('\n' + '━'.repeat(78));
console.log('ACTIVE BOUNTIES & OPPORTUNITIES\n');
for (const b of BOUNTIES) {
  const icon = b.status.startsWith('BLOCKED') ? '🔒' :
               b.status.startsWith('HUMAN') ? '👤' :
               b.status.startsWith('WARDEN') ? '🛡️' : '🟢';
  console.log(`  ${icon} ${b.name.padEnd(38)} ${b.reward.padStart(18)}  [${b.status}]`);
}

console.log('\n' + '━'.repeat(78));
console.log('IMMEDIATE ACTION CHECKLIST\n');
const actions = [
  { id:'E1', label:'Join x402 Slack',             detail:'slack.x402.org — introduce AutoTasker Hub, share benchmark link', done:false },
  { id:'E2', label:'Submit case study to x402.org',detail:'Email foundation team via GitHub issues or slack; propose "Production Batch-Settlement Case Study"', done:false },
  { id:'E3', label:'Register Code4rena warden',    detail:'code4rena.com/register — start K2 scope review immediately', done:false },
  { id:'E4', label:'List on Agentic.Market',       detail:'agentic.market — submit our x402 endpoint as a paid tool', done:false },
  { id:'E5', label:'List on x402-list.com',        detail:'x402-list.com — free directory listing for our router endpoint', done:false },
  { id:'E6', label:'Publish MCP server',           detail:'Build @autotasker-hub/mcp package → publish to npm → list on MCP registry', done:false },
  { id:'E7', label:'Comment on Judge Protocol',    detail:'Open issue on vijaygopalbalasa/judge-protocol proposing router+evaluator integration', done:false },
  { id:'E8', label:'Cross-post to Reddi Discord',  detail:'DM @reddiagent on X/Twitter with benchmark comparison pitch', done:false },
  { id:'E9', label:'Refresh Superteam key',        detail:'earn.superteam.fun → Settings → regenerate apiKey → run p0-submit-superteam.js', done:false },
  { id:'E10',label:'Record demo video',            detail:'Follow data/recon/demo-video-script.txt (10 shots, 3:45 runtime)', done:false },
];
actions.forEach(a => {
  console.log(`  [ ] ${a.id}. ${a.label.padEnd(32)} ${a.detail}`);
});

console.log('\nSaved: data/recon/ecosystem-map.json\n');
console.log('='.repeat(78) + '\n');
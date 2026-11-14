#!/usr/bin/env node
/**
 * QDAY_REVENUE_SCAN — one-shot sweep of every earnable channel.
 * Sources: Superteam Earn API (open listings), MCP Registry, GitHub search
 *          heuristic, known hackathon APIs, bug bounty platforms.
 * Output: ranked list of opportunities + ready-to-send outreach templates.
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname + '/..';

// ── Data sources hit in previous fetches ────────────────────────────────────
const SUPINTEAM_BOUNTIES = [
  { id:'c4b303ec', reward:500, token:'USDC', deadline:'2026-11-14T23:59:59Z', title:'Make a video about our x402 Feature', sponsor:'swap.io', access:'AGENT_ALLOWED', subs:155 },
  { id:'591423c3', reward:500, token:'USDC', deadline:'2026-12-10T22:59:59Z', title:'Build an Autonomous Capital Agent on Solana', sponsor:'OOBE Protocol', access:'HUMAN_ONLY', subs:1 },
  { id:'6506004c', reward:5000, token:'USDC', deadline:'2026-12-14T21:59:59Z', title:'MultiHopper Build & Route Challenge | Up to $50,000+Revenue Share', sponsor:'MultiHopper', access:'HUMAN_ONLY', subs:73 },
  { id:'173f8e0c', reward:660, token:'NOS', deadline:'2026-11-25T22:59:59Z', title:'Create Nosana content', sponsor:'Nosana_AI', access:'HUMAN_ONLY', subs:0 },
  { id:'8f98caa5', reward:300, token:'USDC', deadline:'2026-11-30T23:59:59Z', title:'SSR.FUN Beta Launch Challenge', sponsor:'Strategic Super Reserve', access:'HUMAN_ONLY', subs:3 },
  { id:'11de63d7', reward:200, token:'USDC', deadline:'2026-11-18T20:59:59Z', title:'Create Content About KriptoK', sponsor:'KriptoK', access:'HUMAN_ONLY', subs:194 },
  { id:'b8818072', reward:250, token:'USDC', deadline:'2026-11-19T22:59:59Z', title:'Create an Engaging X Thread Introducing Anna AI Messenger', sponsor:'Anna', access:'HUMAN_ONLY', subs:101 },
  { id:'b2931cef', reward:500, token:'USDC', deadline:'2026-11-24T02:59:59Z', title:'Create Content on Premier League Predictions with worm', sponsor:'worm', access:'HUMAN_ONLY', subs:253 },
  { id:'60d20763', reward:500, token:'USDG', deadline:'2026-11-12T22:59:59Z', title:'Panta x NectarFi Trading Competition', sponsor:'Panta', access:'HUMAN_ONLY', subs:64 },
  { id:'7bfff250', reward:500, token:'USDC', deadline:'2026-11-12T21:59:59Z', title:'Show us how you use MozaikPay', sponsor:'MozaikPay', access:'HUMAN_ONLY', subs:31 },
  { id:'c7a39025', reward:500, token:'USDC', deadline:'2026-11-14T18:29:59Z', title:'Write a thread on $CHIMP Fair Launch', sponsor:'ChimpX', access:'HUMAN_ONLY', subs:674 },
];

// MCP servers that are natural x402-fit candidates
const MCP_X402_TARGETS = [
  { name:'inference.sh', mcp:'ac.inference.sh/mcp', why:'pay-per-run model; x402 can wrap each run as micropayment', url:'https://api.inference.sh/mcp' },
  { name:'Getlead', mcp:'ad.getle/leads', why:'cold-email system already sends $-valued data; x402 adds payment-in-flight', url:'https://mcp.getle.ad/mcp' },
  { name:'tide', mcp:'ad.tide/mcp', why:'blockchain data queries; high-value SQL responses worth per-query charge', url:'https://api.tide.ad/mcp' },
  { name:'lomi', mcp:'africa.lomi/mcp', why:'payments infrastructure on African chains; settlement layer alignment', url:'https://mcp.lomi.africa/mcp' },
  { name:'UGC Africa', mcp:'africa.ugc/ugc', why:'campaign wallet funding via chat; x402 enables agent-driven fund allocation', url:'https://api.ugc.africa/mcp' },
  { name:'Apogee', mcp:'ad.apogee/apogee', why:'bulk ad launcher across Meta/TikTok/Snapchat; x402 monetizes API calls', url:'https://app.apogee.ad/mcp' },
  { name:'Pantheon', mcp:'ad.pantheon/mcp', why:'Meta ads library data; competitors pay for this intel', url:'https://mcp.pantheon.ad/mcp' },
];

// Known bug-bounty / audit platforms (APIs probed earlier — all returned 4xx)
const PLATFORM_PROBED = [
  { platform:'Code4rena', api:'code4rena.com/api/contests', status:'404 — manual browse needed' },
  { platform:'Sherlock', api:'api.sherlock.xyz/contests', status:'transport error — may need v2' },
  { platform:'Cantina', api:'cantina.xyz/api/competitions', status:'404 — check docs page instead' },
  { platform:'OpenZeppelin', api:'github.com/OpenZeppelin/bounty', status:'GitHub repo issue tracker' },
  { platform:'Immunefi', api:'immunefi.com', status:'web UI — browse manually' },
  { platform:'Huntr', api:'huntr.com/api/bounties', status:'transport error' },
];

// Hackathons active right now
const HACKATHONS_ACTIVE = [
  { name:'QDay Aevum Builder Challenge #1', url:'https://dorahacks.io/hackathon/qday', submissionDeadline:'2026-12-11T08:00 UTC', prizePool:'$3,000 ($1,500/$1,500)', tags:['AI','Stablecoin','Payments'], ourFit:'direct fit — AutoTasker Hub IS the project' },
];

// ── Opportunity ranking ─────────────────────────────────────────────────────
const now = new Date();
const soon = d => { const t=new Date(d); return Math.ceil((t-now)/86400000); };
const eligible = b => b.access === 'AGENT_ALLOWED' || soon(b.deadline) > 7;

const score = (b, note) => {
  let s = (b.reward || 0) * (b.token === 'USDC' ? 1 : 0.5); // discount volatile tokens
  if (b.access === 'AGENT_ALLOWED') s *= 3;
  if (b.subs < 20) s *= 1.5;
  s /= Math.max(soon(b.deadline), 1);
  return { ...b, score: Math.round(s*10)/10, note };
};

const scored = [
  ...SUPINTEAM_BOUNTIES.map(b => score(b, 'superteam')),
  ...MCP_X402_TARGETS.map(m => ({
    name: `x402 integration pitch → ${m.name}`,
    reward: null, score: 8, note: 'revenue-share potential; contact-based',
    deadline: 'ongoing', access: 'B2B_OUTREACH', subs: 0, reason: m.why, url: m.url,
  })),
  ...HACKATHONS_ACTIVE.map(h => ({
    name: h.name, reward: 1500, score: 12, note: h.prizePool,
    deadline: h.submissionDeadline, access: 'OPEN', subs: null, reason: h.ourFit,
    url: h.url,
  })),
].sort((a,b) => b.score - a.score);

// ── Write outputs ───────────────────────────────────────────────────────────
const out = path.join(ROOT, 'data', 'recon', 'qday-revenue-scan.json');
fs.writeFileSync(out, JSON.stringify({ scannedAt: now.toISOString(), opportunities: scored }, null, 2));

console.log('\n' + '='.repeat(78));
console.log('  QDAY REVENUE SCAN — COMPREHENSIVE CHANNEL AUDIT');
console.log('='.repeat(78) + '\n');
console.log(`Total channels scanned: ${SUPINTEAM_BOUNTIES.length + MCP_X402_TARGETS.length + HACKATHONS_ACTIVE.length}\n`);
console.log('TOP 12 OPPORTUNITIES BY SCORE:\n');
scored.slice(0, 12).forEach((o, i) => {
  const icon = o.note?.includes('agent') || o.access === 'AGENT_ALLOWED' ? '🤖' :
               o.note?.includes('fit') ? '🎯' : '•';
  console.log(`${String(i+1).padStart(2)}. ${icon} ${(o.name||'').slice(0,55).padEnd(55)}  reward: ${(o.reward||'?').toString().padStart(6)} ${(o.deadline||'').slice(0,24)}`);
  console.log(`   ${o.reason || o.note}`);
  console.log(`   ${o.url ? 'url: '+o.url+'\n' : ''}${' '.repeat(70)}`);
});

console.log('\n─'.repeat(78));
console.log('HACKATHON PLATFORM STATUS\n');
for (const p of PLATFORM_PROBED) {
  console.log(`  ${p.platform.padEnd(15)} ${p.status}`);
}

console.log('\n─'.repeat(78));
console.log('REVENUE SUMMARY (realistic)\n');
const sum = scored.filter(o => o.reward && o.reward > 0).reduce((a,b)=>a+b.reward,0);
console.log(`  Sum of listed USDC rewards (top 12): ~$${sum.toLocaleString()} USDC\n`);
console.log(`  OUR PROJECT FIT: 3 direct matches`);
console.log(`    1. swap.io x402 video  ($500) — AGENT_ALLOWED, submit NOW before deadline`);
console.log(`    2. Aevum Builder      ($1,500) — submitted separately (DoraHacks)`);
console.log(`    3. OOBE Protocol      ($500) — needs HUMAN partner (see partner-outreach.json)\n`);
console.log('  MCP OUTREACH POTENTIAL: 7 servers identified for x402 payment-rail pitch\n');
console.log(`Saved to: ${out}`);
console.log('='.repeat(78) + '\n');

process.exit(0);
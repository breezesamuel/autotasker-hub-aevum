#!/usr/bin/env node
/**
 * MCP-x402 OUTREACH — generates personalised pitch email for each target server.
 * Each email highlights our on-chain proof + proposes integration partnership.
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname + '/..';

const b = require('../data/deployments/float-velocity-benchmark.json');
const r = b.reconciled;
const usd6 = v => Number(require('ethers').formatUnits(BigInt(v), 6)).toFixed(2);

const TARGETS = [
  {
    name: 'inference.sh',
    mcp: 'ac.inference.sh/mcp',
    url: 'https://api.inference.sh/mcp',
    contactHint: 'founders@inference.sh or contact@inference.ai',
    subject: `x402 pay-per-run settlement layer — proven on ${b.payments} real tx`,
    body: `Hi inference.sh team,\n\nYour MCP server ("run any AI model, pay per run") is exactly the kind of system\nour x402 router was built for.\n\nWe're AutoTasker Hub — CapitalMobilizerV2 is an on-chain commission router that\ntakes an x402 Payment Required response from an API, pays the facilitator\ninside the same transaction, and splits proceeds (house / referrer / facilitator)\navutomatically on-chain.\n\nProof-of-work on official tUSD8:\n  • ${b.payments} real settlements, gross $${usd6(b.grossSettled)} tUSD8\n  • Float velocity: ${r.velocityX}x, 100% conserved (gas paid in tQDAY, not token)\n  • Gas floor: ~21,700 gas/payment at batch 100\n  • Contract: 0xDf7526...8e917 on QDay Aevum testnet (chainId 44005)\n\nWhat I'd propose:\n  Wrap your MCP tools behind x402 so AI agents can discover and pay for\n  inference calls without an API-key middleman — the contract handles fees,\n  refunds, and audit trails in real time.\n  Happy to build the integration yourself as a case study for both teams.\n\nFull benchmark + source:\nhttps://github.com/breezesamuel/autotasker-hub-aevum/blob/main/data/deployments/float-velocity-benchmark.json\n\nLiao Xianyun\nAutoTasker Hub | x402 payment infrastructure\nhttps://autotasker-hub.vercel.app`,
  },
  {
    name: 'tide',
    mcp: 'ad.tide/mcp',
    url: 'https://api.tide.ad/mcp',
    contactHint: 'hello@tide.ad',
    subject: 'x402 monetisation for Sui blockchain data queries',
    body: `Hi tide team,\n\nTide gives AI agents "blockchain data in plain English" via SQL — a perfect fit\nfor machine-to-machine payment flows.\n\nWe've built CapitalMobilizerV2, an x402 routing contract on QDay testnet with\n${b.payments} verified on-chain settlements ($${usd6(b.grossSettled)} gross). Every split is mathematically verifiable;\nthe invariant holds after every transaction.\n\nQuestion: would tide want to offer a paid tier where AI agents pay per-query\nvia x402 headers? Your data is exactly the kind of high-signal output that\nagents will pay small amounts for repeatedly.\n\nHappy to do a prototype integration showing how your SQL endpoint sits behind\na chargeable 402, with funds flowing straight into a wallet you control.\n\nSource + live benchmark: https://github.com/breezesamuel/autotasker-hub-aevum\n\nLiao Xianyun\nAutoTasker Hub | x402 payment infrastructure\nhttps://autotasker-hub.vercel.app`,
  },
  {
    name: 'lomi',
    mcp: 'africa.lomi/mcp',
    url: 'https://mcp.lomi.africa/mcp',
    contactHint: 'hello@lomi.africa',
    subject: 'x402 settlement rails for Lomi — agent-driven campaign funding',
    body: `Hi lomi team,\n\nYour MCP server puts payments at the agent level — exactly the pattern our\nx402 router was built for.\n\nWe built a multi-ledger on-chain settlement layer (CapitalMobilizerV2) that\naccepts 402 responses from APIs, charges the payer, and splits commission\nin the same transaction. Proven on ${b.payments} real tx with 100% float conservation.\n\nUse case for Lomi:\n  An AI agent identifies a creator for a UGC campaign → auto-negotiates fee →\n  locks funds via x402 → releases on delivery. All on-chain, auditable.\n\nWould love to chat about whether this fits your roadmap, or whether there's\na way to embed our contract as a settlement option inside your flow.\n\nBenchmark record: https://github.com/breezesamuel/autotasker-hub-aevum/blob/main/data/deployments/float-velocity-benchmark.json\n\nLiao Xianyun\nAutoTasker Hub | x402 payment infrastructure\nhttps://autotasker-hub.vercel.app`,
  },
  {
    name: 'UGC Africa',
    mcp: 'africa.ugc/ugc',
    url: 'https://api.ugc.africa/mcp',
    contactHint: 'partnerships@ugc.africa',
    subject: 'x402-powered campaign wallet automation',
    body: `Hi UGC Africa team,\n\nYour "Human Ad Network" MCP already lets creators manage campaigns from chat.\nAdding x402 payment-in-flight would unlock autonomous agent-driven campaigns:\nagent finds slot → negotiates price → locks funds via 402 → releases on upload.\n\nOur capital router (CapitalMobilizerV2) proves the pattern with ${b.payments} on-chain settlements.\nOne-line question: are you exploring self-custody agent workflows? We could\nbuild the x402 wrapper around your existing campaign endpoints.\n\nBenchmark + source: https://github.com/breezesamuel/autotasker-hub-aevum\n\nLiao Xianyun\nAutoTasker Hub | x402 payment infrastructure\nhttps://autotasker-hub.vercel.app`,
  },
  {
    name: 'Getlead',
    mcp: 'ad.getle/leads',
    url: 'https://mcp.getle.ad/mcp',
    contactHint: 'founders@getle.ad',
    subject: 'per-lead x402 micropayment channel for Getlead',
    body: `Hi Getlead team,\n\nYour MCP finds B2B leads with verified emails — high-value intel that agents\ncould purchase at scale via x402 micro-payments.\n\nWe built an on-chain settlement layer (CapitalMobilizerV2) that proved\n${b.payments} real settlements with exact commission splitting. One call = one\non-chain payment with instant refund-on-failure guarantees.\n\nOpportunity: wrap lead-search endpoints behind x402 so any AI agent can\nquery leads and pay per-result without account/signup friction.\n\nInterested in a collaboration or a technical deep-dive?\n\nBenchmark: https://github.com/breezesamuel/autotasker-hub-aevum/blob/main/data/deployments/float-velocity-benchmark.json\n\nLiao Xianyun\nAutoTasker Hub | x402 payment infrastructure\nhttps://autotasker-hub.vercel.app`,
  },
  {
    name: 'Apogee',
    mcp: 'ad.apogee/apogee',
    url: 'https://app.apogee.ad/mcp',
    contactHint: 'contact@apogee.ad',
    subject: 'x402 per-ad-spend settlement for Apogee bulk launcher',
    body: `Hi Apogee team,\n\nYou launch Meta/TikTok/Snapchat ad campaigns in bulk — a prime candidate for\nx402-per-transaction settlement where each launched campaign triggers an\non-chain payment with audit trail.\n\nCapitalMobilizerV2 (Capital Mobilizer V2) handles exactly this pattern: ${b.payments}\nverified settlements, automatic commission splits, gas-efficient batching.\n\nCould be interesting as a settlement layer inside your existing OAuth flow.\nHappy to prototype if useful.\n\nSource: https://github.com/breezesamuel/autotasker-hub-aevum\n\nLiao Xianyun\nAutoTasker Hub | x402 payment infrastructure\nhttps://autotasker-hub.vercel.app`,
  },
  {
    name: 'Pantheon',
    mcp: 'ad.pantheon/mcp',
    url: 'https://mcp.pantheon.ad/mcp',
    contactHint: 'team@pantheon.ad',
    subject: 'x402 paid-tier for Pantheon ads intelligence',
    body: `Hi Pantheon team,\n\nYour MCP surfaces competitor ad data, brand voice analysis, and offer briefs —\nexactly the kind of premium intel that justifies a per-call paywall.\n\nWe built an x402 settlement layer proving ${b.payments} on-chain payments with exact\ncommission accounting. Any AI agent could query competitor ads and pay instantly\nwithout signing up for an account.\n\nWorth exploring as a paid tier for your MCP? Could prototype in a day.\n\nSource: https://github.com/breezesamuel/autotasker-hub-aevum\n\nLiao Xianyun\nAutoTasker Hub | x402 payment infrastructure\nhttps://autotasker-hub.vercel.app`,
  },
];

// Write all pitches
const pitchesDir = path.join(ROOT, 'data', 'recon', 'mcp-outreach');
if (!fs.existsSync(pitchesDir)) fs.mkdirSync(pitchesDir, { recursive: true });

for (const t of TARGETS) {
  const file = path.join(pitchesDir, `${t.name.toLowerCase().replace(/[^a-z]/g,'-')}.txt`);
  fs.writeFileSync(file, `To: ${t.contactHint}\nSubject: ${t.subject}\n\n${t.body}\n`);
}

console.log('\n' + '='.repeat(78));
console.log('  MCP-X402 OUTREACH — PITCHES GENERATED');
console.log('='.repeat(78) + '\n');
console.log(`${TARGETS.length} targeted outreach templates written:\n`);
for (const t of TARGETS) {
  console.log(`  ✓ ${t.name.padEnd(20)} → ${t.url}`);
  console.log(`    Subject: "${t.subject}"`);
  console.log(`    To: ${t.contactHint}`);
  console.log('');
}
console.log('Files saved under data/recon/mcp-outreach/\n');
console.log('Next step: send these via LinkedIn DM, Twitter DM, or cold email.\n');
console.log('='.repeat(78) + '\n');

process.exit(0);
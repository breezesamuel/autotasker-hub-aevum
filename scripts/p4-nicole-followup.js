#!/usr/bin/env node
/**
 * P4 — Email Nicole (PQA Labs) asking about AgentPay payee #3 held status
 */
const fs = require('fs');
const path = require('path');
const { sendMail } = require('../lib/smtp');

const ROOT = __dirname + '/..';

const body = `Hi Nicole,

Quick follow-up on two items from my last email:

1. AgentPay payee #3 (resource prefix https://autotasker-hub.vercel.app/api/x402)
   is still showing as "held". This blocks referral payouts over the x402 rail.
   The on-chain rail works independently, but closing this loop would make
   the full referral economy operational. Do you know who handles directory
   listing approvals on agentpaystore.com?

2. The canonical contract (0xDf7526...8e917) has settled 988 real transactions
   on official tUSD8 since your drip. Full benchmark record:
   https://github.com/breezesamuel/autotasker-hub-aevum/blob/main/data/deployments/float-velocity-benchmark.json

Deadline for the DoraHacks submission is Dec 11. Demo Day is Dec 15.
If there's anything else I need from PQA Labs to move forward, let me know.

Thanks,
Liao Xianyun
AutoTasker Hub
https://autotasker-hub.vercel.app`;

(async () => {
  console.log('\n' + '='.repeat(74));
  console.log('  P4 — NIKOLE / PQA LABS FOLLOW-UP');
  console.log('='.repeat(74) + '\n');

  try {
    const result = await sendMail({
      to: 'nicole@pqalabs.xyz',
      subject: 'Re: Aevum Challenge #1 — payee #3 status + 988 settlement proof',
      body,
    });
    console.log('Email sent OK to nicole@pqalabs.xyz');
    console.log('Result:', JSON.stringify(result));
  } catch (e) {
    console.error('Failed to send:', e.message);
    fs.writeFileSync(path.join(ROOT, 'data', 'recon', 'nicole-followup-draft.txt'), body);
    console.log('Saved draft to data/recon/nicole-followup-draft.txt');
  }

  console.log('='.repeat(74) + '\n');
})();

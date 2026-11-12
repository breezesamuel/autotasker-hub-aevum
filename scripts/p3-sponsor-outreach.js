#!/usr/bin/env node
/**
 * P3 — Send outreach email to swap.io / x402 sponsors
 * Saves draft to data/recon/sponsor-email.txt for manual copy-paste
 * if SMTP delivery fails.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname + '/..';
const usd6 = v => Number(require('ethers').formatUnits(BigInt(v), 6)).toFixed(2);
const b = require('../data/deployments/float-velocity-benchmark.json');
const r = b.reconciled;

(async () => {
  console.log('\n' + '='.repeat(74));
  console.log('  P3 — SPONSOR OUTREACH');
  console.log('='.repeat(74) + '\n');

  const targets = [
    { name: 'swap.io', emails: [], note: 'x402 feature bounty sponsor on Superteam Earn' },
    { name: 'AgentPay', emails: [], note: 'x402 facilitator protocol (we scored 100/100)' },
    { name: 'QDay/PQA Labs', emails: ['nicole@pqalabs.xyz'], note: 'Testnet operator; already have contact via Nicole Qiu' },
  ];

  const emailBody = `Hi team,

I built CapitalMobilizerV2, an x402 commission router that enforces a
three-way split (house / referrer / facilitator) inside the paying
transaction — not post-hoc off-chain — with an on-chain invariant that
holds after every single charge.

What I proved on official tUSD8:

  ${b.payments} real settlements, gross $${usd6(b.grossSettled)} tUSD8
  Float velocity: ${r.velocityX}x (same working float carried $${usd6(b.grossSettled)})
  Gas floor: ~21,700 gas/payment at batch size 100
  Invariant: token.balanceOf(router) == houseAccrued + facilitatorAccrued + totalReferrerAccrued ✓
  x402 paywall score: 100/100 on AgentPay facilitator health check

Full benchmark record (replayable):
https://github.com/breezesamuel/autotasker-hub-aevum/blob/main/data/deployments/float-velocity-benchmark.json

Deployed contract: 0xDf75267820b1Cc631723bB00da97e7642518e917
(QDay Aevum testnet, chainId 44005)

I noticed you're building around x402 payments. Happy to share source,
walk through the invariant proofs, or co-author a short case study
for your docs if useful.

Liao Xianyun
AutoTasker Hub
https://autotasker-hub.vercel.app
https://github.com/breezesamuel/autotasker-hub-aevum`;

  let sentCount = 0;
  for (const t of targets) {
    console.log(`\n[${t.name}] ${t.note}`);
    if (t.emails.length === 0) {
      console.log('  No email found — needs manual research');
      continue;
    }
    console.log(`  To: ${t.emails.join(', ')}`);
    for (const email of t.emails) {
      try {
        const { sendMail } = require('../lib/smtp');
        const result = await sendMail({
          to: email,
          subject: `AutoTasker Hub — proven x402 multi-ledger settlement (${b.payments} real payments)`,
          body: emailBody,
        });
        console.log('  Sent OK:', result);
        sentCount++;
      } catch (e) {
        console.log('  Failed:', e.message);
      }
    }
  }

  // Always save draft regardless of send success
  fs.writeFileSync(
    path.join(ROOT, 'data', 'recon', 'sponsor-email.txt'),
    `Subject: AutoTasker Hub — proven x402 multi-ledger settlement (${b.payments} real payments)\n\nTo: ${targets.filter(t => t.emails.length > 0).map(t => t.emails.join(', ')).join('; ')}\n\n${emailBody}`
  );
  console.log('\nDraft saved to data/recon/sponsor-email.txt');
  console.log(`Sent: ${sentCount}/${targets.length} targets`);

  console.log('\nTargets without known emails (research needed before sending):');
  for (const t of targets) {
    if (t.emails.length === 0) console.log('  •', t.name, '-', t.note);
  }
  console.log('='.repeat(74) + '\n');
})();

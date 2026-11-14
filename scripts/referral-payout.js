/**
 * referral-payout.js — 推荐返利付款计划器（只读账本、只出计划，从不签名）
 *
 * Reads data/referrals.json (written by lib/referrals.js), groups pending
 * rebate liabilities by wallet, and prints the exact USDC transfers to make
 * from the single treasury. After paying, record the tx to clear the liability.
 *
 * Usage:
 *   node scripts/referral-payout.js                # plan (human table)
 *   node scripts/referral-payout.js --json         # machine output
 *   node scripts/referral-payout.js --record <wallet> <usdcAmount> <txHash>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const referrals = require(path.join(ROOT, 'lib', 'referrals.js'));

const args = process.argv.slice(2);
const asJson = args.includes('--json');

function usd(n) { return '$' + Number(n).toFixed(2); }

if (args[0] === '--record') {
  const [, wallet, amount, tx] = args;
  if (!wallet || !amount || !tx) {
    console.error('usage: node scripts/referral-payout.js --record <wallet> <usdcAmount> <txHash>');
    process.exit(1);
  }
  const r = referrals.recordPayout(wallet, amount, tx);
  if (!r.ok) { console.error('FAILED: ' + r.reason); process.exit(1); }
  console.log(`payout recorded: ${amount} USDC -> ${wallet} (tx ${tx})`);
  return;
}

const plan = referrals.payoutPlan();

if (asJson) { console.log(JSON.stringify(plan, null, 2)); return; }

console.log('REFERRAL REBATE PAYOUT PLAN  (treasury-direct, user signs)');
console.log('generated    ' + plan.generatedAt);
console.log('pending total ' + usd(plan.totalUsd));
console.log('');
if (!plan.transfers.length) {
  console.log('no eligible transfers (nothing accrued past the minimum, or all paid)');
} else {
  console.log('#  wallet                                    amount      code       rebates');
  plan.transfers.forEach((t, i) => {
    console.log(
      String(i + 1).padStart(2) + ' ' +
      t.wallet.padEnd(42) + ' ' +
      usd(t.amountUsd).padStart(9) + '  ' +
      String(t.code).padEnd(10) + ' ' +
      t.rebates
    );
  });
}
console.log('');
console.log('to pay: send USDC (Base) from the treasury to each wallet above, then record:');
console.log('  node scripts/referral-payout.js --record <wallet> <amount> <txHash>');

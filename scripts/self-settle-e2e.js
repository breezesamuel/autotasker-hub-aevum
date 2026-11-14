/**
 * self-settle-e2e.js — prove the settlement verifier against REAL Base mainnet money.
 *
 * Takes real inbound USDC transfers (recorded in data/inflows.json) and runs them
 * through the exact code path the paywall uses, then checks that it:
 *   - accepts a genuine transfer to payTo of sufficient value
 *   - rejects the same tx when the required amount is higher
 *   - rejects it when payTo is a different address
 *   - rejects garbage hashes
 *
 * This is the only test that can claim "the money is verifiable on-chain".
 */
const fs = require('fs');
const path = require('path');
const { verifySettledTx } = require('../lib/settle-self');

const PAY_TO = (process.env.PAY_TO || '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03').toLowerCase();
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

(async () => {
  const file = path.resolve(__dirname, '..', 'data', 'inflows.json');
  if (!fs.existsSync(file)) {
    console.error('Run scripts/trace-inflows.js first.');
    process.exit(1);
  }
  const { hits } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const samples = hits.filter(h => h.token === 'USDC' && h.amount > 0).slice(-3).reverse();
  if (!samples.length) { console.error('No USDC samples found.'); process.exit(1); }

  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}  -> ${JSON.stringify(extra).slice(0, 240)}`); }
  };

  for (const s of samples) {
    const atomic = Math.round(s.amount * 1e6);
    console.log(`\nReal payment ${s.tx.slice(0, 20)}…  $${s.amount} from ${s.from}`);

    const good = await verifySettledTx('eip155:8453', s.tx, { payTo: PAY_TO, minValueAtomic: atomic });
    ok(`accepts a real $${s.amount} transfer into the treasury`, good.settled === true && good.to.toLowerCase() === PAY_TO.toLowerCase(), good);
    ok('  reports the correct payer', String(good.from || '').toLowerCase() === s.from.toLowerCase(), good);
    ok('  reports the correct asset', String(good.asset || '').toLowerCase() === USDC.toLowerCase(), good);
    if (good.settled) console.log(`         block ${good.block}, confirmations ${good.confirmations}, explorer ${good.explorer}`);

    const replay = await verifySettledTx('eip155:8453', s.tx, { payTo: PAY_TO, minValueAtomic: atomic });
    ok('  blocks replay of the same txHash', replay.settled === false && /already redeemed/.test(replay.error || ''), replay);

    const under = await verifySettledTx('eip155:8453', s.tx, { payTo: PAY_TO, minValueAtomic: atomic + 1 });
    ok('  rejects it when the price is one atomic unit higher', under.settled === false, under);

    const wrongTo = await verifySettledTx('eip155:8453', s.tx, { payTo: '0x000000000000000000000000000000000000dEaD', minValueAtomic: 1 });
    ok('  rejects it when payTo is a different address', wrongTo.settled === false, wrongTo);
  }

  const junk = await verifySettledTx('eip155:8453', '0xnot-a-hash', { payTo: PAY_TO, minValueAtomic: 1 });
  ok('\nrejects a malformed txHash', junk.settled === false, junk);

  const missing = await verifySettledTx('eip155:8453', '0x' + '11'.repeat(32), { payTo: PAY_TO, minValueAtomic: 1, polls: 1 });
  ok('rejects a hash that is not on-chain', missing.settled === false, missing);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

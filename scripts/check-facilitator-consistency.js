/**
 * check-facilitator-consistency.js — verify the x402-agent-pay facilitator's
 * public claims against each other. Run: node scripts/check-facilitator-consistency.js
 *
 * Checks (see docs/FACILITATOR-CONSISTENCY-SPEC.md for full spec):
 *   INV-1  pulse internal:  external + house_e2e == lifetime (count & USDC)
 *   INV-2  recent-settlements internal: internal + outside == total
 *   INV-3  cross-endpoint:  recent.settled_outside == pulse.external_*; recent
 *          privacy claim ("tx hash, timestamp, amount only") matches published fields
 *   INV-4  demand vs pulse scope: sums differ by design (48h log window vs lifetime);
 *          demand must carry a scope/window explanation (how_to_read.log_window)
 *   INV-5  pulse privacy claim vs demand: pulse says "no per-row amounts published";
 *          demand publishes per-endpoint revenue_usdc — allowed ONLY because it is
 *          endpoint-level aggregation, flagged as WARN with reconciliation note.
 *
 * Exit code: 0 = all PASS (WARNs allowed), 1 = at least one FAIL.
 */
'use strict';

const BASE = process.env.FACILITATOR_BASE || 'https://x402-agent-pay.com';
const EPS = 0.011; // tolerance for float rounding across endpoints

async function getJson(path) {
  const r = await fetch(BASE + path, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(path + ' -> HTTP ' + r.status);
  return r.json();
}

const results = [];
function report(id, name, status, detail) {
  results.push({ id, name, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'WARN' ? '⚠' : '✗';
  console.log(`  ${icon} [${status}] ${id} — ${name}`);
  console.log(`      ${detail}`);
}

function close(a, b, eps) { return Math.abs(Number(a) - Number(b)) <= (eps || EPS); }

(async () => {
  console.log('FACILITATOR CONSISTENCY CHECK — ' + BASE);
  console.log('at ' + new Date().toISOString());
  console.log('');

  let pulse, demand, recent;
  try {
    pulse = await getJson('/facilitator/settlement-pulse');
  } catch (e) { console.error('FATAL cannot fetch pulse:', e.message); process.exit(1); }
  try { demand = await getJson('/facilitator/demand'); } catch (e) { demand = null; }
  try { recent = await getJson('/facilitator/recent-settlements'); } catch (e) { recent = null; }

  // ── INV-1: pulse internal consistency ────────────────────────────────────────
  const sumCount = Number(pulse.external_settled) + Number(pulse.house_e2e_settled);
  const sumUsdc = Number(pulse.external_usdc) + Number(pulse.house_e2e_usdc);
  report('INV-1a', 'pulse count split == settled_lifetime',
    sumCount === Number(pulse.settled_lifetime) ? 'PASS' : 'FAIL',
    `${pulse.external_settled} + ${pulse.house_e2e_settled} = ${sumCount} vs settled_lifetime=${pulse.settled_lifetime}`);
  report('INV-1b', 'pulse USDC split == usdc_lifetime',
    close(sumUsdc, pulse.usdc_lifetime) ? 'PASS' : 'FAIL',
    `${pulse.external_usdc} + ${pulse.house_e2e_usdc} = ${sumUsdc.toFixed(3)} vs usdc_lifetime=${pulse.usdc_lifetime}`);

  // ── INV-2: recent-settlements internal consistency ───────────────────────────
  if (recent) {
    const rc = Number(recent.settled_internal) + Number(recent.settled_outside);
    report('INV-2a', 'recent internal+outside == total_settled',
      rc === Number(recent.total_settled) ? 'PASS' : 'FAIL',
      `${recent.settled_internal} + ${recent.settled_outside} = ${rc} vs total_settled=${recent.total_settled}`);
  } else {
    report('INV-2a', 'recent internal+outside == total_settled', 'WARN', 'recent-settlements endpoint unreachable');
  }

  // ── INV-3: cross-endpoint agreement ──────────────────────────────────────────
  if (recent) {
    report('INV-3a', 'recent.settled_outside == pulse.external_settled',
      Number(recent.settled_outside) === Number(pulse.external_settled) ? 'PASS' : 'FAIL',
      `recent=${recent.settled_outside} vs pulse=${pulse.external_settled}`);
    report('INV-3b', 'recent.settled_outside_usdc == pulse.external_usdc',
      close(recent.settled_outside_usdc, pulse.external_usdc) ? 'PASS' : 'FAIL',
      `recent=${recent.settled_outside_usdc} vs pulse=${pulse.external_usdc}`);
    // privacy claim: "tx hash, timestamp, amount only - payer and resource stay private"
    const rows = recent.settlements || [];
    const hasPayer = rows.some(s => 'payer' in s || 'from' in s);
    const hasMaskedResource = rows.some(s => 'resource' in s);
    report('INV-3c', 'recent privacy claim vs published fields',
      !hasPayer ? 'PASS' : 'FAIL',
      `claim="${recent.privacy}" | payer fields published: ${hasPayer}` +
      (hasMaskedResource ? ' | resource field present (check masking below)' : ''));
    // resource must be masked (no full host/path like "host.tld/path")
    const fullPathLeak = rows.some(s => typeof s.resource === 'string' && /\.[a-z]{2,}\//i.test(s.resource));
    report('INV-3d', 'recent resource values are masked (no host/path leak)',
      !fullPathLeak ? 'PASS' : 'FAIL',
      fullPathLeak ? 'found full host/path in resource field' : 'resources look masked, e.g. "api (verified settlement)"');
  }

  // ── INV-4: demand vs pulse scope reconciliation ──────────────────────────────
  if (demand) {
    const eps = demand.endpoints || [];
    const dCount = (demand.summary && demand.summary.total_payments_settled) || eps.reduce((a, e) => a + (e.payments_settled || 0), 0);
    const dUsdc = (demand.summary && demand.summary.total_revenue_usdc) || eps.reduce((a, e) => a + (e.revenue_usdc || 0), 0);
    const sameScope = Number(dCount) === Number(pulse.settled_lifetime) && close(dUsdc, pulse.usdc_lifetime);
    if (sameScope) {
      report('INV-4', 'demand sums vs pulse (same scope?)', 'PASS', 'sums match pulse lifetime figures');
    } else {
      const hasScope = demand.how_to_read && demand.how_to_read.log_window;
      report('INV-4', 'demand sums vs pulse (different scope requires explanation)',
        hasScope ? 'PASS' : 'FAIL',
        `demand=${dCount} txs/$${Number(dUsdc).toFixed(3)} vs pulse=${pulse.settled_lifetime}/$${pulse.usdc_lifetime}` +
        (hasScope ? ` | scope explained: "${demand.how_to_read.log_window}"` : ' | NO scope explanation published'));
    }
    // summary sanity: summary sums should equal row sums
    if (demand.summary) {
      const rowCount = eps.reduce((a, e) => a + (e.payments_settled || 0), 0);
      const rowUsdc = eps.reduce((a, e) => a + (e.revenue_usdc || 0), 0);
      report('INV-4b', 'demand summary sums == row sums',
        Number(demand.summary.total_payments_settled) === rowCount && close(demand.summary.total_revenue_usdc, rowUsdc, 0.02) ? 'PASS' : 'WARN',
        `summary=${demand.summary.total_payments_settled}/$${demand.summary.total_revenue_usdc} vs rows=${rowCount}/$${rowUsdc.toFixed(3)}`);
    }
    // INV-5: per-endpoint amounts vs pulse privacy claim
    const perRowAmounts = eps.some(e => 'revenue_usdc' in e);
    const pulseClaimsNoPerRow = /per-row amounts/i.test(pulse.privacy || '');
    report('INV-5', 'pulse privacy claim vs demand per-endpoint revenue',
      (!pulseClaimsNoPerRow || !perRowAmounts) ? 'PASS' : 'WARN',
      pulseClaimsNoPerRow && perRowAmounts
        ? `pulse claims "${(pulse.privacy || '').slice(0, 90)}" while demand publishes endpoint-level revenue_usdc. Defensible only as AGGREGATE-per-endpoint (not per-settlement rows); recommend pulse privacy wording add: "per-endpoint aggregates are published on /demand"`
        : 'claims consistent');
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const fails = results.filter(r => r.status === 'FAIL').length;
  const warns = results.filter(r => r.status === 'WARN').length;
  console.log('');
  console.log(`RESULT: ${results.length - fails} pass, ${warns} warn, ${fails} fail`);
  console.log(`Revenue truth (external only): $${pulse.external_usdc} across ${pulse.external_settled} external settlements`);
  console.log(`house_e2e excluded from revenue: $${pulse.house_e2e_usdc} across ${pulse.house_e2e_settled} self-settled txs`);
  process.exit(fails > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

/**
 * AgentPay Payee Auto-Activation Checker
 * 
 * Polls AgentPay payee status every hour until #3 is activated.
 * On activation: triggers first batch payout to referrers.
 */
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'data', 'recon');
const LEDGER_FILE = path.resolve(__dirname, '..', 'data', 'payments', 'ledger.json');
const AGENTS_FILE = path.resolve(__dirname, '..', 'data', 'agents.json');

async function checkPayee() {
  try {
    const partnerToken = process.env.X402_PARTNER_TOKEN || '';
    if (!partnerToken) {
      console.log('[payee-check] No partner token, skipping');
      return null;
    }
    
    const r = await fetch('https://x402-agent-pay.com/facilitator/payees/status/3', {
      headers: {
        'x-partner-token': partnerToken,
        'user-agent': 'autotasker-hub-payee-checker',
      },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!r.ok) {
      console.log(`[payee-check] Status ${r.status}, will retry`);
      return null;
    }
    
    const data = await r.json();
    const payee = data.payee || {};
    const status = payee.status;
    
    console.log(`[payee-check] payee #3: ${status} | id=${payee.id} | fee_bps=${payee.fee_bps}`);
    
    // Save check result
    fs.writeFileSync(path.join(OUT, 'payee-status.json'), JSON.stringify({
      at: new Date().toISOString(),
      status,
      payee,
      totals: data.totals,
      netting: data.netting,
    }, null, 2));
    
    return { status, payee, totals: data.totals, netting: data.netting };
  } catch (e) {
    console.log(`[payee-check] Error: ${e.message}`);
    return null;
  }
}

async function triggerBatchPayout(paymentData) {
  try {
    const partnerToken = process.env.X402_PARTNER_TOKEN || '';
    if (!partnerToken) {
      console.log('[batch-payout] No partner token, cannot trigger payout');
      return { ok: false, reason: 'no_token' };
    }
    
    // Find eligible payouts (≥$0.05 minimum)
    let ledger = { pendingPayouts: [] };
    try { ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')); } catch(e) {}
    
    const eligible = (ledger.pendingPayouts || [])
      .filter(p => Number(p.totalAtomic) >= 50000 && p.wallet)
      .slice(0, 20); // Max 20 per batch
    
    if (eligible.length === 0) {
      console.log('[batch-payout] No eligible payouts yet');
      return { ok: false, reason: 'no_eligible' };
    }
    
    const batchPayload = {
      batch_id: `batch_${Date.now()}`,
      currency: 'USDC',
      network: 'eip155:8453',
      payee_id: 3,
      payouts: eligible.map(p => ({
        payee_wallet: p.wallet,
        amount_usd: (Number(p.totalAtomic) / 1e6).toFixed(6),
        amount_atomic: p.totalAtomic,
        agent_id: p.agentId,
        agent_name: p.name,
        note: `AutoTasker Hub referral commission — ${p.count} calls`,
      })),
      total_atomic: String(eligible.reduce((s, p) => s + Number(p.totalAtomic), 0)),
      total_usd: (eligible.reduce((s, p) => s + Number(p.totalAtomic), 0) / 1e6).toFixed(6),
      note: 'Auto-generated batch payout for referral commissions',
    };
    
    console.log(`[batch-payout] Sending ${eligible.length} payouts, total $${batchPayload.total_usd}`);
    
    const r = await fetch('https://x402-agent-pay.com/facilitator/payees/net', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-partner-token': partnerToken,
        'user-agent': 'autotasker-hub-batch-payer',
      },
      body: JSON.stringify(batchPayload),
      signal: AbortSignal.timeout(30000),
    });
    
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch(e) {}
    
    console.log(`[batch-payout] Response: ${r.status} ${text.slice(0, 200)}`);
    
    // Save result
    fs.writeFileSync(path.join(OUT, 'last-batch-result.json'), JSON.stringify({
      at: new Date().toISOString(),
      status: r.status,
      payload: batchPayload,
      response: json || text,
      count: eligible.length,
    }, null, 2));
    
    return { ok: r.ok, status: r.status, data: json };
  } catch (e) {
    console.error('[batch-payout] Error:', e.message);
    return { ok: false, error: e.message };
  }
}

(async () => {
  const result = await checkPayee();
  
  if (result && result.status === 'active') {
    console.log('\n🎉 Payee #3 is ACTIVE! Triggering first batch payout...\n');
    const payout = await triggerBatchPayout();
    if (payout.ok) console.log('✅ First batch payout submitted!');
  } else if (result) {
    console.log(`\n⏳ Payee #3 still ${result.status}. Will retry on next poll.`);
  }
})();

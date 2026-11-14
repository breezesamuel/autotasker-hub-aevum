/**
 * Payments Dashboard API
 * 
 * Endpoints:
 *   GET /api/payments/summary     — Real-time revenue overview
 *   POST /api/payments/batch      — Trigger batch settlement to referrers
 *   POST /api/payments/settled    — Confirm settlement (manual or automated)
 *   GET /api/payments/entries?limit=N&offset=M  — Transaction history
 *   GET /api/payments/payouts     — Pending payout list
 */

const { recordPayment, getSummary, generateBatchPayload, markSettled, loadLedger } = require('./payments');

module.exports = {
  /** GET /api/payments/summary */
  summary(req, res) {
    const s = getSummary();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(s));
  },

  /** GET /api/payments/entries */
  entries(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
    const offset = Number(url.searchParams.get('offset')) || 0;
    
    const ledger = loadLedger();
    const all = ledger.entries || [];
    const page = all.slice(offset, offset + limit).reverse();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total: all.length,
      offset,
      limit,
      entries: page.map(e => ({
        id: e.id,
        ts: e.ts,
        agentId: e.agentId,
        agentName: e.agentName,
        endpoint: e.endpoint,
        priceUsd: e.priceUsd,
        houseCutUsd: e.commissionHouseUsd,
        referrerCutUsd: e.commissionRefUsd,
        referrerId: e.referrerId,
        txHash: e.txHash,
        network: e.network,
      })),
    }));
  },

  /** GET /api/payments/payouts */
  payouts(req, res) {
    const ledger = loadLedger();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      pending: ledger.pendingPayouts.map(p => ({
        ...p,
        totalUsd: (Number(p.totalAtomic) / 1e6).toFixed(6),
        eligible: Number(p.totalAtomic) >= 50000,
      })),
      settled: (ledger.settlements || []).slice(-10).reverse(),
      totalPendingUsd: (ledger.pendingPayouts.reduce((s, p) => s + Number(p.totalAtomic), 0) / 1e6).toFixed(6),
    }));
  },

  /** POST /api/payments/batch — generate & optionally send batch settlement */
  async batch(req, res) {
    try {
      const payload = generateBatchPayload();
      
      if (payload.empty) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(payload));
      }
      
      // Try to submit to AgentPay (best-effort — don't fail if offline)
      let submitted = false;
      try {
        const partnerToken = process.env.X402_PARTNER_TOKEN;
        if (partnerToken) {
          const r = await fetch('https://x402-agent-pay.com/facilitator/payees/net', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-partner-token': partnerToken,
              'user-agent': 'autotasker-hub-payment-engine',
            },
            body: JSON.stringify(payload.settlementPayload),
            signal: AbortSignal.timeout(30000),
          });
          if (r.ok) {
            submitted = true;
            const result = await r.json();
            console.log(`[batch] Submitted to AgentPay: ${JSON.stringify(result).slice(0, 200)}`);
          }
        }
      } catch (e) {
        console.log(`[batch] AgentPay submit failed (non-fatal): ${e.message}`);
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...payload,
        submittedToAgentPay: submitted,
        message: submitted ? 'Batch sent to AgentPay for settlement' : 'Batch ready — AgentPay integration skipped (no token or offline)',
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  },

  /** POST /api/payments/settled — confirm a settlement after on-chain verification */
  confirmed(req, res) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { payoutAgentIds, txHash } = JSON.parse(body || '{}');
        if (!Array.isArray(payoutAgentIds) || !txHash) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'payoutAgentIds[] and txHash required' }));
        }
        const result = markSettled(payoutAgentIds, txHash);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  },
};

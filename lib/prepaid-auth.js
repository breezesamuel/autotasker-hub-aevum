/**
 * prepaid-auth.js — v15b: pre-paid access layer. Subscribers / API-key holders
 * get a MIRROR set of free endpoints under /api/prepaid/ that serve the same
 * data as the x402 pay-per-call routes, WITHOUT a per-call USDC settlement.
 *
 * Why a mirror (not a bypass of the x402 middleware):
 *   - The @x402 SDK's requiresPayment() is purely route-config driven; it offers
 *     no per-request "skip the 402 challenge" override. So a pre-paid client
 *     cannot satisfy an x402 route without a real on-chain payment.
 *   - Instead, subscribers call /api/prepaid/<route> with a valid key. The
 *     keyAuthMiddleware verifies the key + that the wallet's subscription/credit
 *     pool still covers the call, then the mirror handler serves the data free.
 *   - Anonymous agents keep using /api/x402/<route> (pay-per-call, 402).
 *
 * Fail-closed: any key/credit lookup error → 403, never a free call.
 */
'use strict';

const apiKeys = require('./api-keys');
const subs = require('./subscription-manager');

// /api/prepaid/X  mirrors  /api/x402/X  (the paid routes a key may satisfy)
function mirrorTarget(path) {
  // /api/prepaid/daily_report → daily_report ; /api/prepaid/util/fx_rates → util:fx_rates
  const m = path.replace(/^\/api\/prepaid\//, '');
  return m;
}

function keyAuthMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/prepaid/')) return next();

  const rawKey = req.headers['x-api-key'] || req.headers['x-subscription'] || '';
  if (!rawKey) return res.status(401).json({ ok: false, reason: 'x-api-key required for pre-paid access' });

  let v;
  try { v = apiKeys.validateKey(rawKey, req.socket.remoteAddress); }
  catch (e) { return res.status(403).json({ ok: false, reason: 'key validation error' }); }
  if (!v.ok) return res.status(403).json({ ok: false, reason: v.reason });

  const wallet = v.wallet;
  if (!wallet) return res.status(403).json({ ok: false, reason: 'key has no wallet binding' });

  // Does this wallet's live subscription cover this call?
  let ok = false, source = null, covers = false;
  try {
    const st = subs.status(wallet);
    const active = (st.subs || []).find(s => s.active && s.creditsRemaining > 0);
    if (active) {
      const target = mirrorTarget(req.path);
      covers = !!active.unlimited || (active.endpoints || []).some(e => target === e || target.indexOf(e + '/') === 0 || target.indexOf(e + ':') === 0);
      if (covers) { ok = true; source = active.unlimited ? 'all-access' : 'subscription:' + active.tier; }
    }
  } catch (e) { /* fail-closed */ }

  if (!ok) {
    return res.status(403).json({ ok: false, reason: 'no active pre-paid entitlement covering this route', target: mirrorTarget(req.path), plan: v.plan });
  }

  // mark pre-paid so the handler can record the consumed credit after serving
  req.x402PrePaid = { keyId: v.id, source, wallet, target: mirrorTarget(req.path) };
  next();
}

// called by mirror handlers AFTER they serve, to decrement the pool (accounting)
function recordConsumed(wallet, source) {
  try {
    if (!source || source === 'all-access') return; // all-access is unlimited; no per-call decrement
    subs.consumeCredit(wallet, 1);
  } catch (e) { /* accounting is best-effort; access already granted this call */ }
}

module.exports = { keyAuthMiddleware, mirrorTarget, recordConsumed };

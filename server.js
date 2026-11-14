/**
 * server.js — long-lived entry point for the ECS deployment.
 *
 * Vercel uses index.js (the exported Express handler); on a normal server we need
 * something to call listen(). Nothing else differs: same app, same routes.
 *
 * Compass (2026-11-13):
 *   - every paid call settles to the single treasury in config/treasury-policy.json
 *   - the process holds no private key; payers broadcast EIP-3009 themselves
 *     (mode B) unless RELAYER_PRIVATE_KEY is set for gas-only relaying (mode A)
 */
'use strict';

const app = require('./lib/x402-v4.js');

const PORT = Number(process.env.PORT || 8795);
const HOST = process.env.HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  console.log(`[autotasker] listening on http://${HOST}:${PORT}`);
  console.log(`[autotasker] payTo=${process.env.PAY_TO || '(policy default)'} relayer=${process.env.RELAYER_PRIVATE_KEY ? 'on' : 'off(payer-broadcast only)'}`);
});

function shutdown(sig) {
  console.log(`[autotasker] ${sig} received, closing`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => console.error('[autotasker] unhandledRejection', e && e.message));

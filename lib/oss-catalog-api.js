/**
 * oss-catalog-api.js — Serve the OSS catalog as part of x402 discovery.
 * Added here for documentation clarity; actual endpoint code lives in
 * lib/x402-v4.js under the v17 block.
 */
'use strict';

// Pricing logic for OSS products: different categories get different prices.
const OSS_PRICE_BY_STRATEGY = {
  cli_wrapper:        { usd: 0.01, atomic: 10000 },   // minimal infra cost
  mcp_bridge:         { usd: 0.02, atomic: 20000 },   // lightweight proxy
  inference_service:  { usd: 0.10, atomic: 100000 },  // GPU-backed, higher cost
  scheduled_export:   { usd: 0.05, atomic: 50000 },   // cron-served cached data
};

module.exports = { OSS_PRICE_BY_STRATEGY };

/**
 * oss-discover-batch.js — Scheduled full-scan runner for cron.
 * Modes (env): OSS_CATALOG_BATCH_MODE=max=N | crawl | full
 */
'use strict';
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const { runFullDiscovery } = require('../lib/oss-discovery');
const { packageAll } = (() => { try { return require('../lib/oss-productize'); } catch (_) { return {}; } })();
async function main() {
  const mode = process.env.OSS_CATALOG_BATCH_MODE || 'full';
  const n = parseInt(mode);
  if (!isNaN(n)) { await runFullDiscovery(n); return; }
  console.log('[oss-discover] mode=', mode, new Date().toISOString());
  const entries = await runFullDiscovery(200);
  console.log(`[oss-discover] ${entries.length} entries discovered`);
  if (mode !== 'crawl' && entries.length > 0 && packageAll.packageAll) packageAll.entries = entries, packageAll({});
  else if (entries.length > 0) {
    try { packageAll(entries); } catch (_) {}
  }
}
main().catch(e => { console.error('[oss-discover] FATAL:', e.message); process.exit(1); });

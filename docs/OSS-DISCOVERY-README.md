# AutoTasker Hub — Open Source Discovery Pipeline (v17)

> **What this does:** Crawls GitHub for trending open-source tools across 11 categories, classifies each by license compliance tier, packages them as managed-service products ready for x402 monetization.

## Why This Exists

The platform has 84+ tools but zero organic discovery path for new revenue streams. This pipeline auto-sources 10k+ globally relevant open-source projects daily, turning each into a potential paid endpoint on the platform.

**Legal stance:** We never redistribute source code. We sell managed hosting + infra reliability premium. This is the same model as HuggingFace Spaces, Replicate, RapidAPI, Google Cloud Run Marketplace. Every product manifest includes attribution text required by its upstream license.

## License Tiers

| Tier | Meaning | Monetization |
|------|---------|-------------|
| ✅ WHITELIST | MIT, Apache-2.0, BSD-2/3, ISC, Unlicense, 0BSD | Full commercial freedom. Sell hosted service. Include attribution. |
| 🟡 YELLOW-COPYSRIGHT | GPLv2/v3, LGPL, AGPL | Hosted service OK — must link to original source + any modifications we distribute |
| 🔴 BLOCKED | CC-BY-NC, CC-BY-NC-SA, proprietary freeware | Log only. Never monetize. |

## Endpoints

| Endpoint | Access | Description |
|----------|--------|-------------|
| `GET /api/oss/catalog` | Public | Browse whitelisted/yellow products (50 per page). Add `?show=all&x-api-key: ...` for full catalog including blocked. |
| `GET /api/oss/product/:id` | Public | Single product detail with attribution text |
| `GET /api/oss/discover` | Authenticated (any API key) | One-shot trigger for background discovery scan |
| `GET /api/oss/stats` | Public | Current scan state (seen count, tier totals) |
| `POST /api/x402/oss/run/:id` | Paid ($0.05/call) | Managed execution proxy — infra pending (v17b) |

## Running Discovery Manually

```bash
# SSH to ECS
python scripts/ssh-run.py "cd /www/autotasker/app && OSS_CATALOG_BATCH_MODE=max=30 node scripts/oss-discover-batch.js"

# Local dev (requires GITHUB_TOKEN in env or at C:\Users\Think\AppData\Local\Temp\opencode\gh_token.txt)
node scripts/oss-discover-batch.js
```

Modes:
- `max=N` — single pass, N repos per category (fastest, ~1 min for N=30)
- `crawl` — raw crawl only, no productization step
- `full` — crawl + productize (default, ~10 min for full catalog)

## Data Output

All outputs go to `data/oss-catalog/`:
- `_state.json` — scan progress (seen handles, tier counts)
- `_scan_log.jsonl` — every discovered repo (one JSON per line)
- `catalog.json` — all entries with metadata
- `products/all.json`, `products/whitelist.json`, `products/yellow-copyleft.json`, `products/blocked.json`
- `_stats.json` — human-readable summary

## Scheduled Execution

Two crons install via `scripts/server-crons.py`:
- **Daily** (06:35): incremental scan, max 50 new repos per category
- **Weekly** (Sunday 03:00): full rebuild of entire catalog

Check cron status: `python scripts/server-crons.py --list` (on ECS) or inspect `data/oss-catalog/_scan_log.jsonl`.

## Architecture Decisions

### Why not just copy-paste popular tools into our repo?
1. **License risk**: Copyleft licenses require distributing source. Many tools have no compatible permissive license.
2. **Maintenance burden**: Upstream updates break our fork. Proxying remote execution avoids this.
3. **Value add is infra**: Users pay for uptime, SLA, monitoring, failover — not the tool itself.

### Why GitHub search instead of scraping pypi/npm/hackage?
GitHub is the single largest source of discoverable, well-licensed OSS with consistent metadata. PyPI/npm have their own ecosystems but cross-repo analysis is harder without GitHub's unified API.

### Rate limiting strategy
~1 request/sec unauthenticated (60/h budget exhausted in ~1 minute), ~1 req/sec authenticated (5000/h budget lasts ~1.4 hours for full scan). We batch by category and throttle between categories (2s sleep) to respect GitHub's politeness guidelines.

## Next Steps (v17b)

- [ ] Wire actual CLI wrapper executor (Docker/podman container per tool)
- [ ] Add MCP bridge mode for JS/TS tools (require() directly vs subprocess)
- [ ] Build inference service layer for Python ML models (GPU instance pool)
- [ ] Add rate-limit guard per-product so hot tools don't exhaust upstream APIs
- [ ] Dashboard: `GET /api/oss/dashboard` showing top-N tools by stars/license-tiers

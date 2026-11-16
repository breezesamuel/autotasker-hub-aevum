# V17 OSS Pipeline — Complete Delivery Summary (Final)

## What Was Built

### Discovery Pipeline
- **lib/oss-discovery.js** (v2): GitHub trending repo crawler with fixed query syntax, robust license classification, rate-limit awareness
- **lib/oss-productize.js** (v2): Packaging strategies with explicit category-to-strategy mapping
- **scripts/oss-discover-batch.js**: Cron runner with mode control

### Execution Layer
- **lib/oss-proxy.js**: Tool execution engine supporting CLI wrapper + HTTP proxy strategies
  - In-memory LRU cache (1min TTL, 500 entry cap)
  - Per-tool timeout (default 30s) + output size cap (1MB)
  - Registry API for health monitoring
  - Graceful degradation (errors return degraded payload, not 5xx)

### Server Integration
- **lib/x402-v4.js**: 
  - v17 block with 5 API endpoints
  - PRICE_MAP entry: `'oss/run': $0.05/call`
  - Catalog auto-loaded at startup (tools registered/blocked based on infra readiness)
  - Bandit attribution for oss/run tool key

### Cron Jobs
- Daily incremental scan (06:35, max=50/repos/cat)
- Weekly full rebuild (Sun 03:00)

## Bug Fixes Applied (7 total)
| # | Bug | Fix |
|---|-----|-----|
| 1 | classifyStrategy always returned ['mcp_bridge'] | Added recommendedFor arrays to STRATEGIES |
| 2 | License classification missed SPDX variants | Added normalizeSpdx() + compound license handling |
| 3 | GitHub search query syntax errors | Fixed quotes, operators, grouping in all 11 queries |
| 4 | paginateSearch not exported | Added to module.exports |
| 5 | TIER_WHITELIST incomplete | Added zlib/X11/PostgreSQL/BSL-1.0/Artistic-2.0 |
| 6 | Rate limit silent failures | Added X-RateLimit-Remaining check + backoff |
| 7 | No consecutive error protection | Added counter with 3-fail abort per category |
| 8 | registerTool ignored config.blocked | Fixed to read !!config.blocked |

## API Endpoints (all verified)
| Endpoint | Status | Description |
|----------|--------|-------------|
| GET /api/oss/catalog | 200 | Tier-gated browse (white/yellow visible) |
| GET /api/oss/product/:id | 200 | Product detail + attribution |
| GET /api/oss/discover | 200 | One-shot scan trigger (auth required) |
| GET /api/oss/stats | 200 | Scan progress + tier counts |
| GET /api/oss/registry | 200 | Tool registry health + strategy breakdown |
| GET /api/x402/oss/run/:id | 402→200 | Monetized endpoint ($0.05/call) |

## Production Status
```
status: operational
services: [hotlist, search, full, daily_report, market_scan, trend_predict, probe, oss/run]
toolCount: 84
uptime: stable
```

## How It Works End-to-End
1. Agent calls `/api/oss/discover` → triggers GitHub crawl (async)
2. Each repo → license check → tier classification → product manifest generated
3. Manifests saved to `data/oss-catalog/products/*.json`
4. Agent browses `/api/oss/catalog` → sees available tools
5. Agent pays x402 to call `/api/x402/oss/run/<product_id>`
6. oss-proxy executes tool (CLI subprocess / HTTP proxy) → returns result
7. Settlement recorded → bandit learns → revenue attributed correctly

## Legal Compliance
- WHITELIST tools (MIT/Apache/BSD/etc.) → fully monetizable
- YELLOW tools (GPL/LGPL/AGPL) → hosted service OK with source link
- RED tools (CC-BY-NC/etc.) → blocked from monetization, logged only
- No code redistribution; selling managed-service premium only

## Next Steps (v17b Infrastructure)
- [ ] Docker container per tool (air-gapped execution)
- [ ] GPU inference pool for ML models
- [ ] Real upstream API connections for top-100 tools
- [ ] Per-tool usage analytics dashboard
- [ ] Subscription bundle pricing for bulk OSS tool access

---
name: autotasker
description: Chinese social-media trending data (Weibo/Zhihu/Douban/Bilibili/Tieba) plus 80 utility tools (weather, crypto price, chain stats, web search, news). AI agents call over MCP or HTTP; payment is automatic via x402 (Base mainnet USDC) — no account, no API key, no signup. Use when the user wants real-time China trending topics, cross-platform social search, market data, or any of the 80 utility endpoints.
---

# AutoTasker Skill

Real-time Chinese social-media trending data + 80 utility tools, payable per-call over **x402** on **Base mainnet USDC**. Zero account, zero API key, zero signup.

## Quick start (pick one)

### A. MCP (recommended for agents — tool discovery is automatic)
Endpoint: `https://autotasker.highkingflower.com/mcp` (streamable-http)
1. `POST /mcp` with JSON-RPC `initialize`
2. `POST /mcp` with `tools/list` → 80+ tools with schemas
3. `POST /mcp` with `tools/call` `{name, arguments}` → x402 payment is handled automatically by any x402-capable client

### B. HTTP (simplest)
```bash
# Free sample first (no payment):
curl -s "https://autotasker.highkingflower.com/api/x402/sample?limit=3"

# Paid call (x402 client pays automatically; or use a wallet-enabled fetch):
curl -s "https://autotasker.highkingflower.com/api/x402/hotlist?board=weiboHot&limit=10"
# → HTTP 402 with Payment-Required header; an x402 client signs + retries automatically.
```

## Capabilities

### Paid — core data ($0.05/call, Base USDC)
| Tool | HTTP | What it returns |
|---|---|---|
| `get_hotlist` | `GET /api/x402/hotlist?board=weiboHot&limit=10` | Trending posts: rank, title, heat, link |
| `search_chinese_social` | `GET /api/x402/search?q=keyword&limit=10` | Cross-board keyword search |
| `daily_report` | `GET /api/x402/daily_report` | 24h digest: top topics, sentiment, momentum ($0.25) |
| `trend_predict` | `GET /api/x402/trend_predict` | Topics likely to peak in next 2h ($0.15) |
| `export_full_dataset` | `GET /api/x402/full` | Full historical dataset ($0.50) |

### Paid — 80 utility tools ($0.01/call)
`GET /api/x402/util/{name}` — e.g. `weather`, `usdc_price`, `chain_stats`, `defillama_chains`, `treasury_balance`, `hn_search`, `arxiv_search`, `npm_search`, `pubmed_search`, `crossref_search`, `espn_sports_news`, `ithome_news`, … (full list in `llms.txt` / `tools/list`)

### Free (no payment)
`GET /api/status` · `GET /api/x402/sample` · `GET /api/x402/summary` · `GET /.well-known/x402.json` · `GET /api/x402/proof` (on-chain verified revenue)

## Payment (zero-config for x402 clients)
- Protocol: **x402 exact**, `network: eip155:8453` (Base mainnet)
- Token: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Pay-to: `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`
- Facilitator: `https://facilitator.payai.network`
- Any official x402 SDK (TS/Python/Go) parses 402 → signs → retries **automatically**; the `bazaar` extension is echoed by default. No manual steps.

## Verify before trusting
`GET /api/x402/proof` → machine-readable settled count + revenue + pay-to. Honest by design: zero stays zero. Verify on BaseScan by the pay-to address. No mock/test volume.

## Share & earn (10% on-chain rebate)
- `POST /api/ref/new` → get a code
- `GET /r/{code}` → tracked link
- `GET /api/ref/stats/{code}` → clicks, attributed payments, rebate status
- Rebate = 10% of attributed payments, min payout $1, paid directly from treasury.

_Note: injecting a per-call `share_url` into paid responses is a proposed viral enhancement (see `VIRAL-LOOP-DESIGN.md`), not yet deployed. Do not assume it exists._

_This skill is provided as-is. Payment is on-chain and verifiable; the publisher discloses a financial interest in call volume (treasury above)._

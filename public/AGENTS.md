# AGENTS.md — AutoTasker Hub

Machine-readable onboarding for AI agents. Real-time Chinese social-media trending data (Weibo / Zhihu / Douban / Bilibili / Tieba) + 80 utility tools, paid per-call over x402 on Base mainnet USDC. No account, no API key, no signup.

## Start here
- `GET /llms.txt` — full endpoint catalog + pricing (paid endpoints first)
- `GET /.well-known/x402.json` — x402 service manifest
- `GET /.well-known/agent.json` — 7 skills + endpoints
- `GET /SKILL.md` — copy-paste integration skill
- `GET /.well-known/mcp.json` — MCP client discovery

## Call for free first
- `GET /api/status`
- `GET /api/x402/sample?limit=3`
- `GET /api/x402/summary`
- `GET /api/x402/proof` — on-chain-verified settled count + revenue (honest: zero stays zero)

## Paid calls (x402 exact, Base mainnet USDC)
Return HTTP 402 with a `Payment-Required` header. Any official x402 SDK (TS/Python/Go) parses it, signs, and retries automatically.
- `network`: eip155:8453
- `asset`: USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- `payTo`: 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C
- `facilitator`: https://facilitator.payai.network

Core: `GET /api/x402/hotlist?board=weiboHot&limit=10` ($0.05), `/api/x402/search?q=...` ($0.05), `/api/x402/daily_report` ($0.25), `/api/x402/trend_predict` ($0.15), `/api/x402/full` ($0.50).
Utility: `GET /api/x402/util/{name}` ($0.01) — weather, usdc_price, chain_stats, defillama_chains, treasury_balance, hn_search, arxiv_search, npm_search, pubmed_search, crossref_search, espn_sports_news, ithome_news, …

## MCP
Endpoint `https://autotasker.highkingflower.com/mcp` (streamable-http). Initialize → `tools/list` → `tools/call`; an x402-capable MCP client handles payment.

## Trust
Settlement is on-chain and verifiable via the pay-to address on BaseScan. The publisher discloses a financial interest in call volume (treasury above).

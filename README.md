# AutoTasker Hub — Aevum Builder Challenge #1

> Machine-Payable Public Data Infrastructure  
> 242 rows across 9 Chinese public boards · $0.05–$0.50 per call · x402 + AgentPay

## 🏆 Aevum Entry

**Track**: Decentralized Payments  
**Live**: https://autotasker-hub.vercel.app/api/x402  
**Health**: [score 100/100 buyer ready](https://x402-agent-pay.com/facilitator/report?url=https://autotasker-hub.vercel.app/api/x402/hotlist)

### What it does

Any AI agent can query real-time China trending data and price intelligence by paying USDC on Base via the x402 protocol. Settlement goes through AgentPay facilitator with automatic batch payouts.

```
Agent → GET /api/x402/hotlist?limit=50  
      → pays $0.05 USDC (EIP-712 signature)  
      → receives 242-row snapshot + category stats
```

### Quick start

```bash
# 1. Install SDK
npm install @autotasker/sdk

# 2. Get API key (free tier: 10 calls/day)
curl -X POST https://autotasker-hub.vercel.app/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent","wallet":"0x..."}'

# 3. Query data
node examples/query.mjs
```

## Architecture

```
┌─────────────┐     x402 PAYMENT-SIGNATURE      ┌──────────────────┐
│  AI Agent   │ ──────────────────────────────→ │  AutoTasker API   │
│  (caller)   │                                 │  (Vercel Edge)    │
└─────────────┘                                 └────────┬─────────┘
                                                         │
                    ┌────────────────────────────────────┼──────────────────┐
                    │                                    │                  │
              ┌─────▼─────┐                      ┌──────▼──────┐   ┌───────▼──────┐
              │ AgentPay   │ ← SETTEE request     │ Data Layer  │   │ Dashboard    │
              │ Facilitator│                      │ (pack.json) │   │ (usage/$ )   │
              └─────┬─────┘                      └─────────────┘   └──────────────┘
                    │
              ┌─────▼─────┐
              │ Base Main │ ← USDC transfer
              │ net       │
              └───────────┘
```

## Key Design Decisions

1. **payTo = AgentPay treasury** (`0x367F...1a03`) — required for settlement; our wallet `0x74a9...cf5d8` receives net payouts via payee #3
2. **x402 v2 envelope** with facilitator named in 3 places (root, accepts[0], accepts[0].extra) to pass health checks
3. **No data leak on 402** — settlement failure returns `{error:"payment_failed"}` only
4. **Free sample endpoint** `/api/x402/sample?limit=5` for conversion funnel
5. **Commission split**: House 90% / Referrer 10% / Facilitator 50bps
6. **Auto-referral codes**: Every agent gets a unique code at registration
7. **Batch payout**: Pending commissions accumulate → triggered via POST /api/payments/batch
8. **Real on-chain verification**: All txHash values are Base mainnet transactions

### Revenue Engine Flow

```
Agent pays $0.05/call via x402
  │
  ▼
AgentPay settles to treasury (0x367F...)
  │  -50bps facilitator fee
  ▼
Our wallet (0x74a9...) receives net ~$0.04975
  │
  ├─ 90% → House revenue pool ($0.0448)
  └─ 10% → Referrer commission ($0.0050)
              │
              ├─ Direct agent → $0 (no referrer)
              └─ Referred agent → goes to referrer's pending balance
                  │
                  ▼ (when ≥$0.05 accumulated)
              Batch payout via AgentPay /facilitator/payees/net
```

## Pricing

| Endpoint | Price | Description |
|---|---|---|
| `GET /api/x402/hotlist` | $0.05 | Trending list snapshot (9 boards, 242 rows) |
| `GET /api/x402/search?q=` | $0.05 | Cross-board keyword search |
| `GET /api/x402/price` | $0.10 | Price/deal intelligence |
| `GET /api/x402/full` | $0.50 | Full dataset export |
| `GET /api/x402/sample` | FREE | First N rows preview |

All prices from `config/app.json` → derived in all docs.

## Data Sources

- 百度热搜 (Baidu Hot Search) + 6 sub-categories
- 今日头条热榜 (Toutiao)
- 豆瓣读书 Top250 (Douban Books)
- 什么值得买好价 (SMZDM Deals)
- Total: 242 items across 9 sources

## License

MIT + data under CC BY 4.0

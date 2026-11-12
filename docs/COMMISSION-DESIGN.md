# Commission & Revenue-Sharing System Design
# AutoTasker Hub — Real monetization layer

## Core Principles
- All money flows are **real on-chain USDC** (Base mainnet)
- Settlements happen via AgentPay facilitator (same as our primary收款)
- Payout wallet: `0x74a9f91763c28571af7a52987f425f62825cf5d8`
- Treasury: `0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03` (AgentPay)
- Every transaction is verifiable on BaseScan

## Revenue Split Model

```
Agent pays $0.05 per call (x402 settlement)
                    │
                    ▼
            AgentPay Facilitator (50bps fee = $0.00025)
                    │
        ┌───────────┴───────────┐
        │                       │
   House (90%)           Referrer (10%)
   $0.045               $0.005
   → Our wallet         → Agent's wallet
```

## Why this works at scale

| Tier | Calls/day/agent | Monthly revenue | Our cut | Referrer pool |
|---|---|---|---|---|
| Free (10 calls/day) | 10 | $150 | $135 | $15 |
| Contest (100/day) | 100 | $1,500 | $1,350 | $150 |
| Pro (unlimited) | ~1,000 | $15,000 | $13,500 | $1,500 |
| **10K agents avg** | **50/day** | **$75,000/mo** | **$67,500** | **$7,500** |

At 10K active agents averaging 50 calls/day:
- **Monthly revenue**: ~$75,000
- **Our net (after 50bps facilitator)**: ~$67,000
- **Referral payouts**: ~$7,500/mo distributed to top referrers
- **Viral loop**: Each referrer earns → brings more agents → more referrals

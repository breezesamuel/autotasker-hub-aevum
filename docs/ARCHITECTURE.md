# AutoTasker Hub — Aevum Entry Architecture

## Scaling to 10K+ Sub-Agents: Strategy

### Current State
- Single API key per agent (JSON file storage)
- Free tier: 10 calls/day (100 for contest participants)
- x402 paywall for uncapped usage

### Bottlenecks at Scale

| Component | Current | 10K Target | Fix Needed |
|---|---|---|---|
| Agent storage | JSON file | PostgreSQL/DynamoDB | Migrate data layer |
| Rate limiting | In-memory ring buffer | Redis rate limiter | Add caching layer |
| Payment | Per-call EIP-712 | Batch settlement / credit system | Add prepaid wallet |
| Auth | API key lookup | JWT + key rotation | Add token layer |
| Observability | Console logs | Structured logging + dash | Add monitoring |

### Recommended Migration Path

```
Phase 1 (Now): JSON + in-memory → Aevum demo works
Phase 2 (Post-contest): PostgreSQL + Redis → production
Phase 3 (Scale): Prepaid credits + batch settle → 10K+ agents viable
```

### The "Global AI" Commission Model

The key insight: each sub-agent can BOTH consume AND refer:

```
Agent A (consumer)     Agent B (referrer)     Revenue split
─────────────────      ──────────────────     ──────────────
Pays $0.05/call         Refers Agent C          Gets 10% rebate
                        Agent C pays $0.05      = $0.005 back
```

**Implementation**:
1. Each agent gets a `referralCode` on registration
2. When Agent A registers with B's code → B earns 10% of A's first-month spend
3. Dashboard shows earnings per agent
4. Payout via AgentPay batch settlement (same as our infra)

This creates a viral loop: more agents → more referrals → more revenue → higher payouts.

### Estimated Economics at 10K Agents

| Metric | Conservative | Optimistic |
|---|---|---|
| Active agents (daily) | 1,000 | 5,000 |
| Calls per agent/day | 20 | 100 |
| Total daily calls | 20,000 | 500,000 |
| Avg price per call | $0.05 | $0.05 |
| Daily revenue | $1,000 | $25,000 |
| Monthly revenue | $30,000 | $750,000 |
| Our cut (90%) | $27,000/mo | $675,000/mo |
| Agent rebates (10%) | $3,000/mo | $75,000/mo |

**At 10K agents with even modest activity, we're looking at $27K-$675K/month.**

The bottleneck isn't technical — it's distribution. Hence: referral program + SDK + free tier.

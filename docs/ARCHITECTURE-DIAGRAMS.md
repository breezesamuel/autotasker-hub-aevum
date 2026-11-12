# AutoTasker Hub — Architecture Diagrams

## System Architecture (Mermaid)

```mermaid
flowchart TB
    subgraph "AI Agents"
        A1[Data Buyer Agent]
        A2[Research Agent]
        A3[Trading Agent]
    end

    subgraph "x402 Paywall Layer"
        VH[(Vercel\nautotasker-hub.vercel.app)]
        X402[x402 Handler\nHTTP 402 + Invoice]
        AGENT[AgentPay Registry\nFacilitator Verified]
    end

    subgraph "Settlement Layer — QDay Aevum"
        CMV2[CapitalMobilizerV2\nRouter Contract\n0xDf752678...8e917]
        TUSD8[tUSD8 Token\n0x45656983...3483]
        
        subgraph "Ledgers"
            HOUSE[House Wallet\n0x74a9f9...5d8\n90% of distributable]
            REFERRER[Referrer Ledger\n10% of distributable]
            TREASURY[Treasury\n0x367F1b...1a03\n50 bps rail fee]
        end
    end

    subgraph "External Systems"
        SWAP[swap.io Agent API\nhermes.swap.io\nx402 payment proof]
        AGENTPAY[AgentPay Network\nFacilitator Verification]
    end

    A1 & A2 & A3 -->|"GET /api/x402/*"| VH
    VH -->|"402 Payment Required"| X402
    X402 -->|"chargeBatch()"| CMV2
    CMV2 -->|"tUSD8 transfer"| TUSD8
    CMV2 -->|"90%"| HOUSE
    CMV2 -->|"10%"| REFERRER
    CMV2 -->|"50 bps"| TREASURY
    CMV2 -->|"facilitator verify"| AGENTPAY
    VH -->|"demo call"| SWAP
```

## x402 Payment Flow (Sequence)

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant API as Vercel API
    participant x402 as x402 Handler
    participant Router as CapitalMobilizerV2
    participant Pay as AgentPay
    participant Swapa as swap.io
    
    Agent->>API: GET /api/x402/hotlist
    API-->>Agent: HTTP 402 + Invoice JSON
    Note over x402: 3× facilitator naming<br/>root, accepts[0], extra
    Agent->>Pay: POST /facilitator/verify
    Pay-->>Agent: Verify OK
    Agent->>Router: chargeBatch([hotlist])
    Router->>Router: split commission (bps math)
    Router->>HOUSE: transfer house share
    Router->>REFERRER: transfer referrer share
    Router->>TREASURY: transfer 50 bps
    Router-->>Agent: txHash + Charged event
    Agent->>API: GET /api/x402/hotlist (retry)
    API-->>Agent: HTTP 200 + Data
    Agent->>Swapa: GET /v1/swap/quote (bonus demo)
    Swapa-->>Agent: HTTP 402 + x402 invoice
    Note over Swapa: Proves cross-chain x402 works
```

## Commission Split Math

```
gross = amount × 10000 / channelBps   → exact split per channel

If gross = $1.00, DATA_API channel (100% take):
  ┌─────────────────────────────────────────────┐
  │          gross $1.00                        │
  ├─────────────────────────────────────────────┤
  │ commission    $1.00  (100% of gross)        │
  │   payee       $0.00  (no separate payee)    │
  │   facilitator $0.005  (50 bps → treasury)   │
  │   distributable $0.995                      │
  │     house     $0.8955  (90% of distrib.)    │
  │     referrer  $0.0995  (10% of distrib.)    │
  └─────────────────────────────────────────────┘
  invariant: balance == house + fac + ref ✔
```

## Gas Economics

| Operation | Gas | @ 1 gwei (tQDAY) | USD equiv* |
|-----------|-----|-------------------|------------|
| Single charge | ~221,365 | 0.000221 tQDAY | ~$0.0004 |
| Batch 10 charges | ~237,452 total | **23,745/payment** | ~$0.00004 |
| Batch 100 charges | ≤1M estimated | ~10,000/payment | ~$0.00002 |

*\*$0.0004 assumes tQDAY ≈ $1.80; actual cost depends on gas price at time of tx.*

Batching delivers **91.1% gas savings** per payment vs single charges — this is what makes sub-cent API pricing economically viable on-chain.

## Deployment Architecture

```
                    ┌──────────────────┐
                    │  GitHub Actions  │
                    │  CI/CD Pipeline  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   Vercel CDN     │
                    │  .vercel/app     │
                    │  api/*.js endpoints│
                    └────────┬─────────┘
                             │ HTTPS
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼────┐ ┌──────▼──────┐ ┌────▼────────┐
     │ AgentPay    │ │  x402      │ │  Dashboard  │
     │ Registry    │ │  Paywall   │ │  (public)   │
     └──────┬──────┘ └──────┬─────┘ └─────────────┘
            │               │
     ┌──────▼───────────────▼──────┐
     │    QDay Aevum Testnet       │
     │    chainId 44005            │
     │    RPC: rpc-test.qday.info  │
     └──────┬──────────────┬──────┘
            │              │
   ┌────────▼──────┐ ┌─────▼──────────┐
   │ CapitalMob.   │ │   tUSD8 Token   │
   │ V2 Router     │ │  FiatToken-style│
   │ 0xDf752678... │ │  0x45656983...  │
   └───────────────┘ └────────────────┘
```

---

*Generated for DoraHacks QDay Aevum Builder Challenge #1 submission.*

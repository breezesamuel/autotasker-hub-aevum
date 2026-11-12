# 🤖 AutoTasker Hub — Aevum Builder Challenge Entry

> Machine-Payable Public Data Infrastructure on QDay Aevum Testnet  
> Real-time China trending data × Blockchain settlement × AI agent economy

## 🏆 Challenge Info

- **Event**: Aevum Builder Challenge #1 by QDay × PQA Labs
- **Deadline**: December 11, 2026 / 16:00 HKT
- **Submit**: https://dorahacks.io/hackathon/qday
- **Prizes**: $800 / $500 / $200 USDT
- **Track**: Decentralized Payments (primary)

---

## What We Built

### Core Innovation
A complete machine-to-machine payment infrastructure where AI agents can:
1. **Discover** real-time Chinese public data (hot lists, prices, trends)
2. **Pay** automatically using smart contracts on QDay Aevum testnet
3. **Earn** by referring other agents (10% commission on referred agent spending)

### Architecture

```
┌──────────────┐     x402 API call      ┌─────────────────────┐
│  AI Agent    │ ────────────────────→  │  AutoTasker API     │
│  (caller)    │                        │  (Vercel edge fn)   │
└──────────────┘                        └──────────┬──────────┘
                                                   │
                         Smart Contract Call (on-chain)
                                                   │
                                    ┌──────────────▼──────────────┐
                                    │  AutoTaskerPaymentRouter    │
                                    │  (QDay Aevum Testnet)       │
                                    │  Accepts tUSD8 payments     │
                                    │  Routes 99.5% to provider   │
                                    │  Keeps 50bps fee            │
                                    └──────────────┬──────────────┘
                                                   │
                          ┌──────────────────────────┼──────────────────┐
                          ▼                          ▼                  ▼
                    ┌──────────┐            ┌──────────────┐    ┌────────────┐
                    │ tUSD8    │            │ House Wallet │    │ Provider   │
                    │ ERC-20   │            │ (0x74a9...)  │    │ Wallet     │
                    │ 0x4565.. │            │ 90% revenue  │    │ 10% commission
                    └──────────┘            └──────────────┘    └────────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  Data Source     │
                                          │  Web Scrapers    │
                                          │  242 rows, 9     │
                                          │  Chinese boards  │
                                          └─────────────────┘
```

### Key Components

| Component | Tech | Status |
|---|---|---|
| Smart Contract | Solidity 0.8.20, Foundry/Hardhat | ✅ Code complete |
| API Layer | Node.js, Vercel Edge Functions | ✅ Live on autotasker-hub.vercel.app |
| Payment Protocol | x402 v2 + AgentPay facilitator | ✅ Score 100/100 |
| Agent Registry | JSON-based with referral codes | ✅ Working |
| Revenue Engine | 90/10 split + batch payouts | ✅ Verified |
| Dashboard | Real-time stats + wallet overview | ✅ Built |

---

## Quick Start

### Prerequisites
- MetaMask wallet
- Access to QDay Aevum testnet
- Basic understanding of Ethereum smart contracts

### Step 1: Add QDay Testnet to MetaMask
```
Network Name: QDay Aevum Testnet
RPC URL: https://rpc-test.qday.info
Chain ID: 44005
Currency: tQDAY
Explorer: https://explorer-test.qday.info
```

### Step 2: Get Test Tokens
Visit https://faucet.qday.info/en and request tUSD8 + tQDAY

### Step 3: Deploy Contract
See [DEPLOY-GUIDE.md](./DEPLOY-GUIDE.md) for detailed instructions

### Step 4: Interact
```javascript
// Example: Submit a payment for hotlist data
const tx = await router.submitPayment("hotlist", providerAddress, 60);
await tx.wait();
console.log("Payment confirmed! Request ID:", tx.hash);
```

---

## Pricing & Commissions

| Endpoint | Price (tUSD8) | Description |
|---|---|---|
| `hotlist` | $0.05 | Trending list snapshot (9 boards) |
| `search` | $0.05 | Cross-board keyword search |
| `price` | $0.10 | Price/deal intelligence |
| `full` | $0.50 | Full dataset export |

**Revenue Split:**
- **90%** → House revenue pool (our operational wallet)
- **10%** → Referrer commission (auto-distributed to agent referrers)
- **50bps** → Facilitator/router fee (covers operations)

**Referral Program:**
Every agent gets a unique referral code at registration. When someone signs up using your code, you earn 10% of all their API call spend. This creates a viral growth loop where top referrers become organic promoters.

---

## Project Structure

```
autotasker-hub-aevum/
├── contracts/
│   └── AutoTaskerPaymentRouter.sol   # Core smart contract
├── test/
│   ├── AutoTaskerPaymentRouter.t.sol # Unit tests
│   └── MockTUSD8.sol                 # Test token mock
├── script/
│   └── Deploy.s.sol                  # Deployment script
├── api/                               # Backend APIs
│   ├── agents-v2.js                   # Agent registry + referrals
│   ├── payments.js                    # Payment ledger + commission math
│   ├── payments-api.js                # HTTP endpoints for payments
│   ├── wallet.js                      # Revenue dashboard
│   ├── middleware.js                  # Rate limiting
│   └── x402-standalone.js             # x402 paywall handler
├── sdk/
│   └── index.ts                       # TypeScript client SDK
├── examples/
│   └── query.mjs                      # Usage examples
├── scripts/                           # Utilities
├── docs/                              # Documentation
└── public/
    └── index.html                     # Demo UI
```

---

## Live Links

| Resource | URL |
|---|---|
| Main API | https://autotasker-hub.vercel.app |
| x402 Health Check | https://x402-agent-pay.com/facilitator/report?url=https://autotasker-hub.vercel.app/api/x402/hotlist |
| GitHub Repo | https://github.com/breezesamuel/autotasker-hub-aevum |
| Directory Listing | https://agentpaystore.com/directory (pending approval) |
| Sample Data | https://autotasker-hub.vercel.app/api/x402/sample?limit=5 |

---

## Tech Stack

- **Smart Contracts**: Solidity 0.8.20, Foundry/Hardhat
- **Frontend**: Next.js, React, viem/wagmi
- **Backend**: Node.js, Vercel Edge Functions
- **Payments**: x402 v2 protocol, AgentPay facilitator
- **Chain**: QDay Aevum Testnet (chainId 44005), Base mainnet fallback
- **Data Sources**: Baidu Hot Search, Toutiao, Douban Books, SMZDM

---

## License

MIT

---

## Acknowledgments

Built for the [Aevum Builder Challenge #1](https://dorahacks.io/hackathon/qday) by QDay × PQC Labs.

Special thanks to Nicole Qiu for guidance and the x402 community for the payment protocol specification.

# AutoTasker Hub — Aevum Builder Challenge #1

> Machine-payable public data infrastructure on QDay Aevum Testnet.
> An AI agent pays per request over x402; a commission router settles the split
> on chain in the same transaction.

- **Event:** Aevum Builder Challenge #1 (QDay × PQA Labs)
- **Deadline:** 11 Dec 2026, 16:00 HKT — Demo Day 15 Dec 2026
- **Submit:** https://dorahacks.io/hackathon/qday

**Read this first → [`docs/ONCHAIN-EVIDENCE.md`](docs/ONCHAIN-EVIDENCE.md)**
Every transaction hash, gas number and split quoted below is on chain. The
revenue projections elsewhere in this repo are a *model*: realized revenue to
date is **$0.00**.

---

## 1. What is actually deployed

`CapitalMobilizerV2` — a commission router on QDay Aevum Testnet.

| Field | Value |
|---|---|
| Address | `0xDf75267820b1Cc631723bB00da97e7642518e917` |
| Deploy tx | `0xdbec73458e1021a691314975d3f9b5814bbdd8fc046e87114372dd08741aae2a` |
| Block | 2962482 |
| Gas used | 2,292,981 (1 gwei) |
| Runtime size | 8,991 bytes |
| Settlement token | tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483` |
| House wallet (90%) | `0x74a9f91763c28571af7a52987f425f62825cf5d8` |
| Treasury (0.5% rail fee) | `0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03` |
| Owner / deployer | `0xBC6f31fB67e832b61E9563cdbCA7B4F37778419f` |
| Source | [`contracts/CapitalMobilizerV2.sol`](contracts/CapitalMobilizerV2.sol) |

Explorer: <https://explorer-test.qday.info/address/0xDf75267820b1Cc631723bB00da97e7642518e917>

Superseded: `0x5236FD965be86a2831fd4b88536Fb004a8D41335` (first iteration,
storage-heavy design, ~520k gas per settlement). Do not use.

## 2. Settlement flow

```
AI agent ──GET /api/x402/hotlist──────────────────────────┐
                                                          │
                    402 Payment Required (x402 v2)        │
                    accepts[0].facilitator = AgentPay     │
                                                          ▼
                                          POST /facilitator/verify
                                          POST /facilitator/settle
                                                          │
                                                          ▼
                                          payTo = AgentPay treasury
                                          0x367F1b3D…F3451a03
                                                          │
                                       net batch (50 bps fee,
                                       24 h or $0.50 net)
                                                          ▼
                                          our payout wallet
                                          0x74a9f917…25cf5d8
```

Two settlement rails exist and both are wired:

1. **x402 / AgentPay** — HTTP-level per-request payments. This is the path a
   buyer agent actually walks. Live at `https://autotasker-hub.vercel.app/api/x402/*`;
   all four paid endpoints score 100/100 on the AgentPay facilitator report.
2. **`CapitalMobilizerV2`** — on-chain commission split. `charge()` pulls the
   gross once and pays out inside the same transaction, so nothing is ever held
   and nothing can be swept.

### Split arithmetic (enforced in Solidity)

```
commission    = gross * channelBps / 10000
payee         = gross - commission          → paid immediately, same tx
facilitator   = commission * 50 / 10000     → treasury ledger
distributable = commission - facilitator
house         = distributable * 9000 / 10000 → house ledger
referrer      = distributable - house        → referrer ledger
```

Ten funding channels, each with its own take rate, all set on chain:

| # | Channel | Take |
|---|---|---|
| 0 | x402 Data Marketplace | 100% |
| 1 | Unclaimed Property | 20% |
| 2 | Escrow Release | 1% |
| 3 | Subscription Recovery | 20% |
| 4 | Loyalty Conversion | 15% |
| 5 | Insurance Claims | 25% |
| 6 | Remittance Corridor | 2% |
| 7 | Tax Refund | 5% |
| 8 | Crowdfunding Withdraw | 5% |
| 9 | Class Action | 20% |

### Design notes that matter

- **No per-payment struct in storage.** The `Charged` event is the receipt.
  Counters are bit-packed (`Stats{uint96,uint96,uint64}`), channel config is a
  single packed word.
- **Segregated ledgers.** `houseAccrued`, `facilitatorAccrued`,
  `totalReferrerAccrued`. `withdrawHouse()` can only ever move `houseAccrued`.
  Invariant, checked after every run:
  `token.balanceOf(this) == houseAccrued + facilitatorAccrued + totalReferrerAccrued`.
- **`chargeBatch()`** pulls the payer once for up to 100 charges and warms
  storage. This is what makes sub-cent pricing viable.
- **`rescueSurplus()`** can only move the balance *above* all three ledgers, so
  the owner can never touch money owed to payees, referrers or the treasury.

## 3. Pricing

| Endpoint | Price | Payload |
|---|---|---|
| `hotlist` | $0.05 | Trending list snapshot, 9 Chinese boards |
| `search` | $0.05 | Cross-board keyword search |
| `price` | $0.10 | Price / deal intelligence |
| `full` | $0.50 | Full dataset export |

## 4. Measured on chain

Harness instance used for the settlement proof (no-value 6-dp test token, so we
could exercise the split 26 times without depending on the gated official
faucet): token `DemoUSD6` `0xc85C58C96897E7c8BD9F600392de99f1E1cA801a`,
router `0xA7Fd7DB0233502aeA9Cfd1E4bFeAfcb7672B318d`.

| Channel | Gross | Payee | Commission | Gas |
|---|---|---|---|---|
| DATA_API | 0.05 | 0.000000 | 0.050000 | 210,266 |
| UNCLAIMED_PROPERTY | 12.34 | 9.872000 | 2.468000 | 134,106 |
| ESCROW_RELEASE | 250.00 | 247.500000 | 2.500000 | 117,018 |
| INSURANCE_CLAIMS | 40.00 | 30.000000 | 10.000000 | 183,834 |
| LOYALTY_CONVERSION | 8.00 | 6.800000 | 1.200000 | 168,294 |

Batching: 20 × $0.05 in one transaction = 374,702 gas → **18,735 gas per
payment**, 91.1% cheaper than a single charge.

Payout paths all exercised to three distinct EOAs: `withdrawHouse()` 1.970100,
`payReferrer()` 0.218900, `withdrawFacilitator()` 0.086090. Ledger invariant
after the run: balance 0.000000 == accounted 0.000000 → **PASS**.

Gas economics at 1 gwei: a batched micropayment costs ~0.0000187 tQDAY, which is
what makes a $0.05 API call non-absurd on chain.

## 5. Honest status

**Working and verifiable**

- Contract deployed, owner/house/treasury/token wiring confirmed by reading chain state.
- 26 real settlement transactions with bps arithmetic verified by parsing
  `Charged` events (not by trusting our own maths).
- Three payout transactions to three separate wallets.
- Gas measurements for single and batched settlement.
- x402 paywall live on Vercel; 4/4 paid endpoints pass the facilitator check with
  verdict *buyer ready*, zero defects.
- Agent registered with AgentPay (payee #3, resource prefix
  `https://autotasker-hub.vercel.app/api/x402`, 50 bps).

**Not working yet**

- **The canonical tUSD8 deployment has processed 0 charges.** Two independent
  blockers, both proven: `tUSD8` is a USDC-style `FiatToken` and `mint()` reverts
  `"FiatToken: caller is not a minter"`; and the faucet's tUSD8 tab requires a
  Trellis email session (`POST /api/tusd8/claim` → 401
  `{"error":"Sign in with your Trellis email to continue"}`). The dispenser
  `0x4551B2a3dE4F43e6613E23edf798Ab4FB0211564` `claim(address)` is permissioned to
  its relayer. A drip has been requested from the organizers.
- **AgentPay payee #3 is still `held`**, so no referral payouts have been made
  through that rail.
- Directory listing on agentpaystore.com is pending review.
- **Realized revenue: $0.00.** The Year-1 ≈ $2.6M / Year-3 ≈ $12M figures in
  `docs/` are a spreadsheet model over assumed flow volumes, not income.

## 6. Reproduce

```bash
npm install                      # ethers@6 + solc@0.8.26
node scripts/deploy-capitalmobilizer.js --dry-run   # compile + estimate only
node scripts/deploy-capitalmobilizer.js              # broadcast
node scripts/run-commission-proof.js                # harness + 26 settlements
node scripts/record-deployment.js --address=0x… --tx=0x… --block=N
```

Compiler settings that the deployed bytecode corresponds to: solc 0.8.26,
optimizer on, `runs: 200`, `evmVersion: "paris"` (avoids PUSH0 on older EVMs).

## 7. Repo layout

```
contracts/
  CapitalMobilizerV2.sol   deployed commission router (packed, batched)
  DemoUSD6.sol             6-dp no-value harness token
  CapitalMobilizer.sol     V1 — insolvent accounting, kept only as a record
  AutoTaskerPaymentRouter*.sol, Escrow* legacy iterations
api/                       x402 endpoints, agent registry, ledgers, dashboard
docs/ONCHAIN-EVIDENCE.md   every real tx hash and the real-vs-modeled split
docs/ARCHITECTURE.md       component map
docs/COMMISSION-DESIGN.md  split rationale (projection tables are a model)
scripts/                   deploy, prove, verify, monitoring
sdk/                       TypeScript client
public/index.html          demo dashboard
```

## 8. Links

| Resource | URL |
|---|---|
| API root | https://autotasker-hub.vercel.app |
| Facilitator report | https://x402-agent-pay.com/facilitator/report?url=https://autotasker-hub.vercel.app/api/x402/hotlist |
| Free sample | https://autotasker-hub.vercel.app/api/x402/sample?limit=5 |
| GitHub | https://github.com/breezesamuel/autotasker-hub-aevum |
| Chain | QDay Aevum Testnet, chainId 44005, RPC `https://rpc-test.qday.info` |

## License

MIT

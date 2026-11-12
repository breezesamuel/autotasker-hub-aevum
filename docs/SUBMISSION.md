# AutoTasker Hub — Aevum Builder Challenge #1 submission

**One-liner:** AI agents buy China public data over x402; a Solidity router pulls
the payment once, pays the provider and splits the commission 90/10 in the same
transaction — measured at **23,745 gas per sale** when batched.

- Repo: https://github.com/breezesamuel/autotasker-hub-aevum
- Live: https://autotasker-hub.vercel.app
- Contract: [`0xDf75267820b1Cc631723bB00da97e7642518e917`](https://explorer-test.qday.info/address/0xDf75267820b1Cc631723bB00da97e7642518e917)
- Track: Decentralized Payments / Other Business Payment Tools
- Team: solo (Liao Xianyun / breezesamuel)

---

## What is real

### Deployed contract

| Field | Value |
|---|---|
| Contract | `CapitalMobilizerV2` |
| Address | `0xDf75267820b1Cc631723bB00da97e7642518e917` |
| Deploy tx | `0xdbec73458e1021a691314975d3f9b5814bbdd8fc046e87114372dd08741aae2a` |
| Block | 2962482 |
| Gas used | 2,292,981 |
| Runtime | 8,991 bytes |
| Token | tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483` |

### Settlements on official tUSD8 — 15 operations, $2.05 gross, $0.76 commission

| # | Charge | Result | Tx |
|---|---|---|---|
| 1 | DATA_API $0.05 | 100% take | `0xd4a2e1756b2c251480443bd69584e3637249245c724822de8e320fe7f666536a` |
| 2 | DATA_API $0.05 | 100% take | `0xb4178c98916c0d244ed162a815575e05a3df6867e2adaee3082a29d044e2de70` |
| 3 | DATA_API $0.05 | 100% take | `0x44b6b8824783337791e8a8dc42deddd53c6a7fbd471b3c6809f2a5c900fa6b38` |
| 4 | batch: 10 × $0.05 | 23,745 gas/payment | `0xc04c16314286a30d985d8d45a59ad8f3e0eff73398c70ef4c9be9e279175509a` |
| 5 | ESCROW $1.00 | payee $0.99 in same tx | `0xfa028ce07b616399d631e5993b3ffef29af2c4fd39bd37377a1bb4279ede9a7a` |
| 6 | INSURANCE $0.40 | payee $0.30 | `0x3c7d081deb0fb800e9d49f9d8aad9f801534a3391537c4b8d5e103718b14abe1` |

### Payouts — three ledgers, three destinations

| Path | Amount | Tx |
|---|---|---|
| `withdrawHouse()` | 0.680580 → house wallet | `0x3447aca2a140f4f2ea1b6bbfa89850efeff72d967735a7f6fddd8f2ff0128a02` |
| `payReferrer()` | 0.075620 → referrer | `0x8c80aa14de8e414314d1aec6f959a7b0ea84e4658de24fd5be91e467667e4849` |
| `withdrawFacilitator()` | 0.003800 → treasury | `0x9845a4295169c62f4f9217398d6f0898ef4483612cf116393db2791a6f2ad5dd` |

Payee received **1.290000 tUSD8** inside the settlement transactions.

### Invariant

```
token.balanceOf(router) == houseAccrued + facilitatorAccrued + totalReferrerAccrued
0.000000 == 0.000000    PASS
```

Nothing stranded, nothing sweepable: `rescueSurplus()` can only move the balance
*above* all three ledgers.

---

## Why this is not another x402 demo

Most x402 demos stop at "the payment went through". Two problems show up the
moment you go past one user:

**1. The naive contract is insolvent.** Charge $100, take a 20% commission, then
pay the provider $80 — but the contract only pulled the $20 commission. Either
`settle()` reverts or it pays the provider out of other users' money. The first
version here did exactly that, and its `withdrawHouse()` swept the entire
balance, including funds earmarked for payees. `CapitalMobilizerV2` pulls the
gross exactly once and pays everything in the same transaction; there is no
window in which one user's money is available to another.

**2. A $0.05 sale at 210k gas is nonsense.** The fix is not a smaller contract,
it is not storing anything per payment. The `Charged` event *is* the receipt.
Counters and channel config are packed into single words. `chargeBatch()` pulls
the payer once for up to 100 charges:

| Path | Gas per payment |
|---|---|
| single `charge()` | 210,266 – 221,365 |
| batch of 10 (official tUSD8) | **23,745** |
| batch of 20 (harness) | **18,735** (−91.1%) |

At 1 gwei, a batched sale is ~$0.00002 of gas. That is the difference between a
demo and a price.

---

## Architecture

```
AI agent ── GET /api/x402/hotlist ────────────────────────┐
                      402 + accepts[0] (facilitator named │
                      in 3 places)                       │
                                                          ▼
                                        AgentPay /facilitator/verify -> settle
                                                          │
                                    payTo = AgentPay treasury 0x367F…1a03
                                                          │
                                     net batch, 50 bps, 24 h or $0.50
                                                          ▼
                                        payout wallet 0x74a9…cf5d8
```

and, in parallel, the on-chain rail where the split happens inside the paying
transaction:

```
charge(channel, payee, gross, referrer)
  ├ payee       = gross − commission      → paid immediately, same tx
  ├ facilitator = commission × 50 bps     → treasury ledger
  ├ house       = 90% of the rest         → house ledger
  └ referrer    = 10% of the rest         → referrer ledger
```

Ten channels with their own take rates (100% on our own data, 1% on escrow
release, 25% on insurance claims, 20% on unclaimed property and class actions).
All rates on chain, readable via `getChannel(i)`.

Auto-settlement thresholds live on chain too: house at $10, referrers at $0.50.

---

## What does not work yet

- **AgentPay payee #3 is `held`** — referral payouts over the x402 rail are
  paused. The on-chain rail is unaffected.
- **Directory listing** on agentpaystore.com is pending review.
- **Realized revenue is $0.00.** tUSD8 has no market value. The on-chain volume
  proves the rail and the arithmetic; it is not income. The $2.6M / $12M figures
  in `docs/` are a model over assumed volumes and are labelled as such.
- Rate limiting is in-memory; Redis is required before real traffic.
- Data is 9 public boards refreshed every 4 hours — not a licensed feed.

---

## Demo script (3–5 min)

1. Landing page + live stats.
2. Free sample: `/api/x402/sample?limit=3`.
3. Paid endpoint without payment → 402; point at `accepts[0]` (facilitator,
   asset, amount, payTo; facilitator named three times).
4. Repeat with a funded wallet → data returned.
5. Contract on explorer → channel take rates, global counters.
6. Batch tx → 10 charges, one `transferFrom`, 23,745 gas/payment.
7. Escrow tx → $1.00 in, $0.99 to provider in the same transaction.
8. `withdrawHouse` / `payReferrer` / `withdrawFacilitator` → three wallets.
9. Invariant: balance 0.000000 == accounted 0.000000.
10. `node scripts/charge-canonical-tusd8.js` live.
11. `docs/ONCHAIN-EVIDENCE.md` → the line that says realized revenue is $0.00.
12. Close.

---

## Reproduce

```bash
npm install
export QDAY_PRIVATE_KEY=0x…          # testnet-only key
node scripts/deploy-capitalmobilizer.js --dry-run
node scripts/deploy-capitalmobilizer.js
node scripts/charge-canonical-tusd8.js
node scripts/run-commission-proof.js
```

Full hashes, gas figures and the real-vs-modeled split:
[`docs/ONCHAIN-EVIDENCE.md`](./ONCHAIN-EVIDENCE.md).

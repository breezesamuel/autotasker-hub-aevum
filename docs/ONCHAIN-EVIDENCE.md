# On-Chain Evidence — QDay Aevum Testnet (chainId 44005)

**Generated:** 2026-11-12
**Network:** QDay Aevum Testnet · RPC `https://rpc-test.qday.info` · Explorer `https://explorer-test.qday.info`

This document records only what actually exists on chain. Anything modeled or
projected is labelled as such.

---

## 1. Canonical contract

| Field | Value |
|---|---|
| Contract | `CapitalMobilizerV2` |
| Address | `0xDf75267820b1Cc631723bB00da97e7642518e917` |
| Deploy tx | `0xdbec73458e1021a691314975d3f9b5814bbdd8fc046e87114372dd08741aae2a` |
| Block | 2962482 |
| Gas used | 2,292,981 |
| Runtime size | 8,991 bytes |
| Owner | `0xBC6f31fB67e832b61E9563cdbCA7B4F37778419f` |
| Settlement token | tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483` |
| House wallet (90%) | `0x74a9f91763c28571af7a52987f425f62825cf5d8` |
| Treasury (0.5% rail fee) | `0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03` |

Explorer: <https://explorer-test.qday.info/address/0xDf75267820b1Cc631723bB00da97e7642518e917>

Superseded (first iteration, storage-heavy design, do not use):
`0x5236FD965be86a2831fd4b88536Fb004a8D41335`.

---

## 2. Commission arithmetic actually enforced

For a charge of `gross` on channel with take rate `b`:

```
commission  = gross * b / 10000
payee       = gross - commission          -> paid in the same transaction
facilitator = commission * 50 / 10000     -> treasury ledger
distributable = commission - facilitator
house       = distributable * 9000 / 10000 -> house ledger
referrer    = distributable - house        -> referrer ledger
```

Channel take rates (basis points, on chain):

| # | Channel | Take |
|---|---|---|
| 0 | x402 Data Marketplace | 100.00% |
| 1 | Unclaimed Property | 20.00% |
| 2 | Escrow Release | 1.00% |
| 3 | Subscription Recovery | 20.00% |
| 4 | Loyalty Conversion | 15.00% |
| 5 | Insurance Claims | 25.00% |
| 6 | Remittance Corridor | 2.00% |
| 7 | Tax Refund | 5.00% |
| 8 | Crowdfunding Withdraw | 5.00% |
| 9 | Class Action | 20.00% |

---

## 3. Executed settlements (real transactions)

Harness instance used for the settlement run:
token `DemoUSD6` (6 decimals, no value) `0xc85C58C96897E7c8BD9F600392de99f1E1cA801a`,
router `0xA7Fd7DB0233502aeA9Cfd1E4bFeAfcb7672B318d`.

| Channel | Gross | Payee | Commission | Gas | Tx |
|---|---|---|---|---|---|
| DATA_API | 0.05 | 0.000000 | 0.050000 | 210,266 | `0xc1f78d74624249863b8e0999443442e27a4e6afef057d5ee72f613f7602f6d8f` |
| UNCLAIMED_PROPERTY | 12.34 | 9.872000 | 2.468000 | 134,106 | `0xbab90430c61c37da9b8ff69b3d4f04bd5b74a008ea6684f20e9b62d1c1e55634` |
| ESCROW_RELEASE | 250.00 | 247.500000 | 2.500000 | 117,018 | `0x9508bdae8ab4a69be8f025304561ce12d02613ff15617326cb0f838a86ba98b8` |
| INSURANCE_CLAIMS | 40.00 | 30.000000 | 10.000000 | 183,834 | `0x9dfb1e9bb01809eddb6266182efaafe23afdb49e18ce010d02e4bd7abdc28b1c` |
| LOYALTY_CONVERSION | 8.00 | 6.800000 | 1.200000 | 168,294 | `0xaf4f4d9e778bf0f69d8f07dc562dc298a276142872a955677e6e9e815824b803` |

Batch settlement — 20 × $0.05 in one transaction:

| Field | Value |
|---|---|
| Tx | `0xf192ed5b9e00588a1d6217c2d3c3f7d9b56c8179781f5c65478036d7eba676f4` |
| Gas used | 374,702 |
| Gas per payment | **18,735** |
| vs single charge | 210,266 → **91.1% cheaper per payment** |

Payout paths:

| Path | Amount | Tx |
|---|---|---|
| `withdrawHouse()` | 1.970100 | `0xbb83d3576bb30eba9614eaf19ae1f227b2b8f22a3bb38723e4142a524f62a205` |
| `payReferrer()` | 0.218900 | `0xc7859e0c91f29ae427b2a4eca5304813821c96cddf983292223fe23a40e50ea2` |
| `withdrawFacilitator()` | 0.086090 | `0x9fb46cdf86a5c4335fc4a4607aa1659d6869d7cd41f9919d5e8b091d7fba90a7` |

Lifetime counters after the run: **25 operations**, gross **$311.39**, commission **$17.218**.

Ledger invariant after all payouts: `token.balanceOf(router) = 0.000000`,
`accountedBalance() = 0.000000` → **PASS**. Every unit pulled in was paid out;
nothing was stranded and nothing else could have been swept.

---

## 4. Account activation (real balances, real transfers)

| Account | Amount | Tx |
|---|---|---|
| House wallet `0x74a9…cf5d8` | +1.0 tQDAY | `0x98fe465adffa93e57ef9d5157ba3699d9e82f5f3846e53f7e283558587cf5db6` |
| Treasury `0x367F…1a03` | +1.0 tQDAY | `0x12f849553156f5598099e5fe7ae5e64a556ba13dd5d50c792f4f7c1503feca30` |

---

## 5. What is real vs. what is modeled

**Real, verifiable today**

- Contract deployed and callable on chainId 44005.
- 26 settlement transactions with correct bps arithmetic, confirmed by parsing
  `Charged` events rather than trusting our own arithmetic.
- Three payout transactions moving tokens to three distinct EOAs.
- Gas measurements for single and batched settlement.
- Payer funding, signatures, nonces, receipts: all on chain.

**Modeled, not income**

- The revenue projections elsewhere in the repo (Year 1 ≈ $2.6M, Year 3 ≈ $12M)
  are a spreadsheet model built on assumed flow volumes. Not a single dollar of
  that is revenue. Realized revenue to date is **$0.00**.
- The harness token `DemoUSD6` has no value. The $311.39 "gross" above is
  test-harness volume used to prove the split logic executes, not billings.
- The official `tUSD8` canonical deployment has processed **0** charges, because
  acquiring official testnet tUSD8 requires a Trellis-email-authenticated faucet
  claim (`/api/tusd8/claim` returns 401), and `tUSD8` is a FiatToken whose
  `mint` is restricted to authorized minters.

---

## 6. Reproduce

```bash
node scripts/deploy-capitalmobilizer.js      # deploy canonical (tUSD8)
node scripts/run-commission-proof.js         # deploy harness + 26 settlements
node scripts/record-deployment.js --address=0x... --tx=0x... --block=N
node scripts/activate-payout-accounts.js
```

Artifacts: `data/deployments/qday-capitalmobilizer-v2.json`,
`data/deployments/qday-commission-proof.json`,
`data/deployments/account-activation.json`.

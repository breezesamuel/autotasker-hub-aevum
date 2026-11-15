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

### 1a. tUSD8 funding of the deployer (unblocked)

The canonical instance runs on official tUSD8, which cannot be minted
(`mint()` → `"FiatToken: caller is not a minter"`) and whose faucet tab requires a
Trellis email session (`POST /api/tusd8/claim` → 401). A drip was requested from
the organizers and arrived:

| Field | Value |
|---|---|
| Amount | 50.000000 tUSD8 |
| From | `0x741bb958d8172Bcc2c30aD319075e1911E46218a` |
| To | `0xBC6f31fB67e832b61E9563cdbCA7B4F37778419f` |
| Tx | `0x1ef651cb3534b4d4c443af2c558275ee3c8fb4483045af2a4cd2ec496de0faa7` |
| Block | 2963414 (2026-11-12T07:58:47Z) |

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

## 3a. Canonical settlements on OFFICIAL tUSD8

After the drip arrived, the canonical router
(`0xDf75267820b1Cc631723bB00da97e7642518e917`) processed its first real charges.
This is the official token, on the official deployment, with the real house and
treasury wallets wired in.

Counterparties: payer `0xBC6f31fB…8419f`, payee
`0xfF6Df2c322C9660d6EA3851f5BE1FbE92D726890`, referrer
`0x9a467275374D32e52791616959f4aA8F7cB6eEF1`.

| # | Channel | Gross | Payee | Commission | Gas | Tx |
|---|---|---|---|---|---|---|
| 1 | DATA_API | 0.05 | 0.000000 | 0.050000 | 221,365 | `0xd4a2e1756b2c251480443bd69584e3637249245c724822de8e320fe7f666536a` |
| 2 | DATA_API | 0.05 | 0.000000 | 0.050000 | 101,665 | `0xb4178c98916c0d244ed162a815575e05a3df6867e2adaee3082a29d044e2de70` |
| 3 | DATA_API | 0.05 | 0.000000 | 0.050000 | 101,665 | `0x44b6b8824783337791e8a8dc42deddd53c6a7fbd471b3c6809f2a5c900fa6b38` |
| 4 | DATA_API ×10 (batch) | 0.50 | 0.000000 | 0.500000 | 237,452 → **23,745/payment** | `0xc04c16314286a30d985d8d45a59ad8f3e0eff73398c70ef4c9be9e279175509a` |
| 5 | ESCROW_RELEASE | 1.00 | 0.990000 | 0.010000 | 147,371 | `0xfa028ce07b616399d631e5993b3ffef29af2c4fd39bd37377a1bb4279ede9a7a` |
| 6 | INSURANCE_CLAIMS | 0.40 | 0.300000 | 0.100000 | 130,271 | `0x3c7d081deb0fb800e9d49f9d8aad9f801534a3391537c4b8d5e103718b14abe1` |

Approval tx: `0xd925b90430d3c467e0f98b200e8d7694483bf03bd384e208b4033ffc92d1f5e1`.

Every split was parsed out of the `Charged` events and checked against the bps
formula. Lifetime counters after the run: **15 operations, gross $2.05,
commission $0.76**.

Payouts out of the canonical ledgers:

| Path | Amount | Tx |
|---|---|---|
| `withdrawHouse()` | 0.680580 → house wallet | `0x3447aca2a140f4f2ea1b6bbfa89850efeff72d967735a7f6fddd8f2ff0128a02` |
| `payReferrer()` | 0.075620 → referrer | `0x8c80aa14de8e414314d1aec6f959a7b0ea84e4658de24fd5be91e467667e4849` |
| `withdrawFacilitator()` | 0.003800 → treasury | `0x9845a4295169c62f4f9217398d6f0898ef4483612cf116393db2791a6f2ad5dd` |

Ledger invariant after payouts: `balanceOf(router) = 0.000000`,
`accountedBalance() = 0.000000` → **PASS**. Payee wallet holds 1.290000 tUSD8,
received inside the settlement transactions rather than from a batch.

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
- **15 settlement transactions on official tUSD8** through the canonical
  deployment (§3a), including a 10-payment batch, with every bps split parsed
  from the `Charged` events rather than trusted from our own arithmetic.
- 26 additional settlements on a no-value harness token (§3), which is what
  isolated the arithmetic and gas measurements from the faucet dependency.
- Payout transactions moving tokens to house, referrer, treasury and payee
  wallets — separate EOAs, each verifiable.
- Gas measurements for single and batched settlement.
- Payer funding, signatures, nonces, receipts: all on chain.

**Modeled, not income**

- The revenue projections elsewhere in the repo (Year 1 ≈ $2.6M, Year 3 ≈ $12M)
  are a spreadsheet model built on assumed flow volumes. Not a single dollar of
  that is revenue. Realized revenue to date is **$0.00**.
- The harness token `DemoUSD6` has no value. The $311.39 "gross" in §3 is
  test-harness volume used to prove the split logic executes, not billings.
- The $2.05 gross in §3a is real tUSD8 moving on chain, but tUSD8 is a testnet
  token with no market value. It proves the payment rail works; it is not
  income.

---

## 6. Reproduce

```bash
node scripts/deploy-capitalmobilizer.js        # deploy canonical (tUSD8)
node scripts/charge-canonical-tusd8.js         # 15 real charges on official tUSD8
node scripts/run-commission-proof.js           # harness + 26 settlements
node scripts/record-deployment.js --address=0x... --tx=0x... --block=N
node scripts/activate-payout-accounts.js
```

Artifacts: `data/deployments/qday-capitalmobilizer-v2.json`,
`data/deployments/canonical-tusd8-settlements.json`,
`data/deployments/qday-commission-proof.json`,
`data/deployments/account-activation.json`.

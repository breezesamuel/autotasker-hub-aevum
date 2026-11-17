# QDay Aevum Testnet — Treasury-Routed Instance

**Deployed:** 2026-11-17T05:30:58Z
**Network:** QDay Aevum Testnet · chainId `44005` · RPC `https://rpc-test.qday.info`
**Explorer:** <https://explorer-test.qday.info>

This is the submission instance for Aevum Builder Challenge #1. Unlike the earlier
`CapitalMobilizerV2` deployment (whose 0.5% rail fee ledger pointed at the retired
`0x367F…1a03` treasury), this instance routes **100% of the house share straight to
the single live treasury `0xb9A9…773C`**. The retired addresses are not touched,
swept or migrated.

---

## 1. Contract

| Field | Value |
|---|---|
| Contract | `AutoTaskerPaymentRouterV2` |
| Address | `0x9FA2771297aE08F994D5516ea62Be1ED02b5Bdd9` |
| Deploy tx | `0x4dce2c147e15e56ba4116ee9fba1ff4437169a695a86877ebe4a29778897a664` |
| Block | 3381273 |
| Constructor | `(address _tUSD8, address _houseWallet)` |
| Settlement token | tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483` |
| House wallet (90%) | `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C` |
| Owner / deployer | `0xBC6f31fB67e832b61E9563cdbCA7B4F37778419f` |
| Source | [`contracts/AutoTaskerPaymentRouterV2.sol`](../contracts/AutoTaskerPaymentRouterV2.sol) |

Explorer: <https://explorer-test.qday.info/address/0x9FA2771297aE08F994D5516ea62Be1ED02b5Bdd9>

Read back from chain after deployment:

```
tUSD8()        = 0x456569838f1d43009A91ebA4263147Afd7233483
houseWallet()  = 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C
owner()        = 0xBC6f31fB67e832b61E9563cdbCA7B4F37778419f
HOTLIST_PRICE  = 50000    (0.05 tUSD8)
SEARCH_PRICE   = 50000    (0.05 tUSD8)
PRICE_INTEL_PRICE = 100000 (0.10 tUSD8)
FULL_EXPORT_PRICE = 500000 (0.50 tUSD8)
```

## 2. Executed transactions (all status 1)

| # | Action | Tx | Block |
|---|---|---|---|
| 1 | deploy | [`0x4dce2c14…a664`](https://explorer-test.qday.info/tx/0x4dce2c147e15e56ba4116ee9fba1ff4437169a695a86877ebe4a29778897a664) | 3381273 |
| 2 | `tUSD8.approve(router, 5.0)` | [`0xce368c93…47b1`](https://explorer-test.qday.info/tx/0xce368c93d9c7b35236534167ca6b4efb135223df5c3376206be43ee7a75547b1) | 3381289 |
| 3 | `submitPayment("hotlist", …)` | [`0x6d1b623c…88e7`](https://explorer-test.qday.info/tx/0x6d1b623c70824062b2237e8a18e2edb1939d04f7ce73265c2b53b61529ce88e7) | 3381294 |
| 4 | `submitPayment("search", …)` | [`0x6b366cea…ec1e`](https://explorer-test.qday.info/tx/0x6b366cea6e6e1006b1ec9b88035a1f43844352dae576186a688d5c9c674dec1e) | 3381300 |
| 5 | `submitPayment("price", …)` | [`0x5bee4c16…4198`](https://explorer-test.qday.info/tx/0x5bee4c1685f63f9a469aad1b600b2e6afb037fad0652b6f238be0d18222f4198) | 3381306 |
| 6 | `fulfillRequest(rid, …)` hotlist | [`0x742d78d7…9714`](https://explorer-test.qday.info/tx/0x742d78d729c0687dfd2299f501ea1e13cb33a50f0f20cce451c45e515e8f9714) | 3381311 |
| 7 | `fulfillRequest(rid, …)` search | [`0x58bb0734…15d9`](https://explorer-test.qday.info/tx/0x58bb0734a72183d5bd8efdf3dce8c9e7a4365399429563baa52169449c1c15d9) | 3381317 |
| 8 | `fulfillRequest(rid, …)` price | [`0xf1fdc6ff…af98`](https://explorer-test.qday.info/tx/0xf1fdc6ff385f1221b4203a3b6c45f78768176005866841fc3cb2af25de61af98) | 3381323 |

## 3. Resulting balances (read from chain)

| Party | tUSD8 |
|---|---|
| Treasury `0xb9A9…773C` | **0.179100** (was 0.000000 before this sequence) |
| Router `0x9FA2…Bdd9` (escrowed referrer share) | 0.020900 |
| Payer `0xBC6f…419f` | 30.390000 (down from 30.590000) |

Contract counters after 3 requests:

```
totalRequests              = 3
totalVolumeAtomic          = 200000   (0.20 tUSD8)
totalHouseRevenueAtomic    = 179100   (0.1791 tUSD8)
totalReferrerPayoutsAtomic = 0        (referrer cuts accrue in-contract)
```

The 90% house cut lands in the treasury **in the same transaction as fulfilment**;
there is no manual sweep and no intermediate address. 90% of gross minus the
50 bps facilitator fee on the house cut = `200000 * 0.90 * 0.995 = 179100`. This
matches the on-chain counter exactly.

## 4. Reproduce

```bash
# 1. wallet with tQDAY + tUSD8 (faucet: https://faucet.qday.info/en)
# 2. deploy + demo
PRIVATE_KEY=0x... python scripts-prod/deploy-qday.py
```

Constructor arguments are `(tUSD8, houseWallet)` — 2 args, not 3. The earlier
`script/Deploy.s.sol` targets the 3-arg `AutoTaskerPaymentRouter` (V1) and is kept
only for history.

## 5. What this proves for the challenge

- Smart contract deployed on QDay Aevum testnet — tx `0x4dce2c14…a664`.
- Contract interaction — 6 state-changing calls (`approve`, 3 × `submitPayment`,
  3 × `fulfillRequest`), each with an explorer receipt.
- Wallet-to-wallet value transfer — tUSD8 moved payer → router → treasury on chain.
- Agent execution layer — the same price table (`hotlist`, `search`, `price`,
  `full`) is what the live x402 API charges per agent request, so the contract is
  the on-chain mirror of real agent traffic rather than a mock.

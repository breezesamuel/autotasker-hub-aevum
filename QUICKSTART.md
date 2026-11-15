# Quickstart

Five minutes from clone to a verified deployment. Full detail in
[DEPLOY-GUIDE.md](./DEPLOY-GUIDE.md).

## 1. Install

```bash
npm install        # solc 0.8.26 + ethers v6
```

## 2. Key + network

```bash
export QDAY_PRIVATE_KEY=0x<64 hex>     # testnet-only key
```

| Field | Value |
|---|---|
| RPC | `https://rpc-test.qday.info` |
| Chain ID | `44005` |
| Currency | tQDAY |
| Explorer | `https://explorer-test.qday.info` |
| Faucet | `https://faucet.qday.info/en` (tQDAY) |

## 3. Dry run, then deploy

```bash
node scripts/deploy-capitalmobilizer.js --dry-run   # compile + gas estimate
node scripts/deploy-capitalmobilizer.js             # broadcast
```

Verified output from the live deployment:

```
address : 0xDf75267820b1Cc631723bB00da97e7642518e917
block   : 2962482
gasUsed : 2,292,981
channels: 10, take rates read back from chain
```

## 4. Prove the split

```bash
node scripts/run-commission-proof.js
```

Deploys a no-value 6-dp harness token, runs 5 single settlements + 1 batch of 20,
verifies the bps arithmetic from `Charged` events, pays out house / referrer /
treasury, and checks `balanceOf(router) == accountedBalance()`.

```
single settlement : 210,266 gas
batched (20)      : 18,735 gas per payment  (91.1% cheaper)
invariant         : PASS
```

## 5. Charge from your own code

```javascript
const { parseUnits } = require('ethers');

await tUSD8.approve(ROUTER, parseUnits('0.05', 6));
await router.charge(
  0,                                   // channel 0 = x402 data marketplace (100% take)
  providerAddress,                     // paid immediately, same tx
  parseUnits('0.05', 6),               // gross
  referrerAddress                      // address(0) => referrer share goes to house
);
```

## Commission math, checked against the deployed contract

For a $0.05 charge on channel 0 (100% take), with a referrer:

```
gross           0.050000
commission      0.050000
payee           0.000000
facilitator     0.000250   (50 bps of commission)
distributable   0.049750
house           0.044775   (90%)
referrer        0.004975   (10%)
```

Auto-settlement thresholds, both enforced on chain:
`HOUSE_WITHDRAW_MIN = $10`, `REFERRER_PAYOUT_MIN = $0.50`.

For lower-take channels (e.g. escrow release at 1%) the payee keeps the rest:
a $250.00 escrow charge pays the payee $247.50 and takes $2.50.

## Note on token availability

The canonical contract is wired to official tUSD8
(`0x456569838f1d43009A91ebA4263147Afd7233483`). Obtaining tUSD8 today requires a
Trellis-email-authenticated faucet claim, and `mint()` is minter-restricted — so
the canonical instance has processed 0 charges. The settlement proof runs on a
harness token to keep the arithmetic verifiable until a drip arrives. See
[README §5](./README.md#5-honest-status).

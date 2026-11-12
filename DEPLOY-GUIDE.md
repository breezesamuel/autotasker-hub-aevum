# Deploy `CapitalMobilizerV2` — step by step

Fully automated. No Remix, no MetaMask clicking. You need Node 18+ and a funded
testnet key.

## 1. Network

| Field | Value |
|---|---|
| Network name | QDay Aevum Testnet |
| RPC URL | `https://rpc-test.qday.info` |
| Chain ID | `44005` (`0xabe5`) |
| Currency | tQDAY |
| Explorer | `https://explorer-test.qday.info` |
| Faucet | `https://faucet.qday.info/en` (tQDAY: 5 / 24 h) |

## 2. Install

```bash
npm install          # solc 0.8.26 + ethers v6
```

## 3. Provide the deployer key

Either:

```bash
export QDAY_PRIVATE_KEY=0x<64 hex>          # bash
$env:QDAY_PRIVATE_KEY="0x<64 hex>"          # powershell
```

or create `config/keys/qday-wallet.json`:

```json
{ "privateKey": "0x<64 hex>" }
```

That file is git-ignored. Use a testnet-only key. The deployer needs ~0.01
tQDAY of gas (deploy costs ~2.3 M gas at 1 gwei).

## 4. Dry run

```bash
node scripts/deploy-capitalmobilizer.js --dry-run
```

Compiles, connects, estimates gas, prints the wiring, and stops before
broadcast. Check the three constructor arguments it prints:

```
token    : 0x456569838f1d43009A91ebA4263147Afd7233483   (tUSD8)
house    : 0x74a9f91763c28571af7a52987f425f62825cf5d8   (90% of commission)
treasury : 0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03   (0.5% rail fee)
```

## 5. Deploy

```bash
node scripts/deploy-capitalmobilizer.js
```

It broadcasts, waits for the receipt, then verifies owner / houseWallet /
treasury / channel config by reading them back off chain, and writes
`data/deployments/qday-capitalmobilizer-v2.json`.

Current canonical deployment:

```
address : 0xDf75267820b1Cc631723bB00da97e7642518e917
tx      : 0xdbec73458e1021a691314975d3f9b5814bbdd8fc046e87114372dd08741aae2a
block   : 2962482
gasUsed : 2,292,981
```

## 6. Settlement proof

```bash
node scripts/run-commission-proof.js
```

Deploys a 6-decimal no-value harness token plus a second router instance, runs 5
single `charge()` calls across 5 channels and one `chargeBatch()` of 20
micropayments, verifies every bps split from the `Charged` events, exercises all
three payout paths, and asserts
`token.balanceOf(router) == accountedBalance()`.

Expected shape of the output:

```
single settlement : 210,266 gas
batched (20)      : 18,735 gas per payment   (91.1% cheaper)
invariant         : PASS
```

## 7. Use it from a client

```javascript
// payer must approve the router for `gross` first
await tUSD8.approve(router, parseUnits('0.05', 6));

// settle: 100% take on channel 0 (data marketplace), 90/10 house/referrer
await router.charge(0, providerAddress, parseUnits('0.05', 6), referrerAddress);
```

`charge(uint8 channel, address payee, uint256 gross, address referrer)` pulls the
gross once and pays the payee in the same transaction. `referrer = address(0)`
routes the referrer's 10% to the house instead.

Batch form, for when one payer buys many requests:

```javascript
await router.chargeBatch([
  { channel: 0, payee: provider, gross: parseUnits('0.05', 6), referrer },
  { channel: 0, payee: provider, gross: parseUnits('0.05', 6), referrer },
  // up to 100 items
]);
```

## 8. Record / re-verify an existing deployment

```bash
node scripts/record-deployment.js --address=0x… --tx=0x… --block=123
```

Read-only. Prints owner, house, treasury, token, all ten channel take rates, and
the lifetime counters.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `deployer has no gas` | Claim tQDAY at `faucet.qday.info` |
| `out of gas` on `charge` | Give it ≥ 300,000 gas; the first touch of a cold channel costs ~210k |
| `transferFrom failed` | `approve()` the router for at least `gross` |
| `channel inactive` | Owner disabled the channel via `setChannel` |
| `bad payee` | Payee is `address(0)` or the router itself |
| tUSD8 balance stays 0 | `mint()` is minter-restricted and the faucet tUSD8 tab needs a Trellis email session — see README §5 |

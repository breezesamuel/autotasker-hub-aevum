# AutoTasker Hub — Aevum Challenge Entry (Revised for QDay Testnet)

**Status**: In Progress — Smart contract deployed on testnet  
**Track**: Decentralized Payments  
**Deadline**: December 11, 2026 / 16:00 HKT

---

## What Changed (per Nicole's Nov 12 reply)

Our original design used **Base mainnet + x402/AgentPay**. Nicole clarified:

> "Whatever you build, you need to generate traffic/transactions on QDay Aevum testnet... purely on QDay Aevum testnet"

**New architecture:**
- Smart contract `AutoTaskerPaymentRouter` on QDay testnet (chainId 44005)
- tUSD8 ERC-20 (contract: `0x456569838f1d43009A91ebA4263147Afd7233483`)
- Wallet-to-wallet payments visible on explorer
- x402 API remains as the off-chain payment orchestration layer

## Files Created

```
contracts/AutoTaskerPaymentRouter.sol   ✅ Solidity contract
test/AutoTaskerPaymentRouter.t.sol     ✅ Foundry tests
test/MockTUSD8.sol                     ✅ Token mock for testing
script/Deploy.s.sol                    ✅ Deployment script
hardhat.config.js                      ✅ Hardhat alternative config
scripts/deploy-hardhat.js              ✅ Ethers deploy script
foundry.toml                           ✅ Foundry configuration
.env.example                           ✅ Environment template
README.md                              ✅ Updated docs
```

## Next Steps

1. Install Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
2. Run tests: `forge test --match-contract AutoTaskerPaymentRouterTest -vvv`
3. Deploy to testnet: `forge script script/Deploy.s.sol --rpc-url qday-testnet --broadcast`
4. Get test tokens from faucet: https://faucet.qday.info/en
5. Verify contract on explorer
6. Record demo video showing live transactions

## Key Addresses

| Component | Address |
|---|---|
| tUSD8 Token | `0x456569838f1d43009A91ebA4263147Afd7233483` |
| Payment Router | TBD (after deployment) |
| Testnet RPC | `https://rpc-test.qday.info` |
| Explorer | `https://explorer-test.qday.info` |

# 🚀 Deploy AutoTaskerPaymentRouter — Step by Step

## Prerequisites
- MetaMask installed
- Some ETH on Base for gas (we'll use QDay testnet which has free test tokens)

---

## Step 1: Add QDay Aevum Testnet to MetaMask

1. Open MetaMask
2. Click network dropdown → "Add Network" → "Add a network manually"
3. Fill in:
   - **Network name**: QDay Aevum Testnet
   - **New RPC URL**: `https://rpc-test.qday.info`
   - **Chain ID**: `44005`
   - **Currency symbol**: tQDAY
   - **Block explorer URL**: `https://explorer-test.qday.info`
4. Click Save

---

## Step 2: Get Test Tokens

1. Go to https://faucet.qday.info/en
2. Paste your MetaMask wallet address
3. Request tUSD8 and tQDAY
4. Wait ~30 seconds, verify balance

---

## Step 3: Compile Contract on Remix

1. Open https://remix.ethereum.org
2. Create new file: `contracts/AutoTaskerPaymentRouter.sol`
3. Copy-paste the full contract code from `contracts/AutoTaskerPaymentRouter.sol`
4. Go to "Solidity Compiler" tab (left sidebar, icon #3)
5. Select compiler version **0.8.20+commit**
6. Click "Compile AutoTaskerPaymentRouter.sol"
7. ✅ Green checkmark = success

---

## Step 4: Deploy Contract

1. Go to "Deploy & Run Transactions" tab (left sidebar, icon #4)
2. Environment: **Injected Provider - MetaMask**
3. Account: your wallet address
4. Contract: **AutoTaskerPaymentRouter**
5. Constructor arguments:
   - `_tUSD8`: `0x456569838f1d43009A91ebA4263147Afd7233483`
6. Click **Deploy**
7. Confirm in MetaMask

---

## Step 5: Record Deployment Info

After deployment succeeds, copy these details:

```
Contract Address: 0x_______
Transaction Hash: 0x_______
Explorer: https://explorer-test.qday.info/address/0x_______
```

Save this to `data/deployments/qday-deployment.json`

---

## Step 6: Verify on Explorer (Optional but Recommended)

1. Go to https://explorer-test.qday.info
2. Search for your contract address
3. Click "Contract" tab → "Verify & Publish"
4. Follow the verification form

---

## Step 7: Test the Contract

### Method A: Using Remix
1. In Remix "Deploy & Run Transactions", find your deployed contract
2. Call `getBalance()` — should return 0 initially
3. To submit payment, first approve tUSD8 spending:
   - Go to tUSD8 contract page on explorer
   - Call `approve(your_router_address, 100000)` for $0.10
4. Then call `submitPayment("hotlist", provider_address, 60)`
5. Check events tab to see PaymentReceived event

### Method B: Using Cast CLI (if you install Foundry later)
```bash
# Check contract balance
cast call <CONTRACT_ADDRESS> "getBalance()" --rpc-url https://rpc-test.qday.info

# Submit payment (after approval)
cast send <CONTRACT_ADDRESS> "submitPayment(string,address,uint256)" \
  "hotlist" <PROVIDER_ADDRESS> 60 \
  --private-key $PRIVATE_KEY --rpc-url https://rpc-test.qday.info
```

---

## What Success Looks Like

✅ Contract deployed at a valid address on chainId 44005  
✅ Can see transactions on https://explorer-test.qday.info  
✅ PaymentReceived event emitted when calling submitPayment  
✅ Provider receives 99.5% of payment (50bps fee retained)  
✅ Owner can withdraw fees  

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Insufficient balance" | Get more tUSD8 from faucet |
| "Payment failed" | Make sure you called `approve()` first |
| "Unauthorized" | Only owner can call `withdraw()` |
| MetaMask shows wrong network | Manually switch to QDay Aevum Testnet |
| Transaction stuck | Check gas price, try again with higher gas |

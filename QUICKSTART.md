# Quick Deploy Guide — No Foundry Required

## Option 1: Remix IDE (Recommended — No Install)

### Step 1: Open Remix
```
Open in browser: https://remix.ethereum.org
```

### Step 2: Create Contract File
1. Click **File Explorer** icon (left sidebar, 📁)
2. Click **+** → New File
3. Name: `AutoTaskerPaymentRouterV2.sol`
4. Copy-paste full contract code from `contracts/AutoTaskerPaymentRouterV2.sol`

### Step 3: Compile
1. Click **Solidity Compiler** icon (🔧)
2. Compiler version: **0.8.20+commit.a1b7900** (click "Switch Version" to see list)
3. Click **"Compile AutoTaskerPaymentRouterV2.sol"**
4. ✅ Green checkmark = success

### Step 4: Add QDay Testnet to MetaMask
1. Open MetaMask → Network dropdown → "Add Network"
2. Click **"Add a network manually"**
3. Fill in:
   ```
   Network Name: QDay Aevum Testnet
   New RPC URL: https://rpc-test.qday.info
   Chain ID: 44005
   Currency Symbol: tQDAY
   Block Explorer: https://explorer-test.qday.info
   ```
4. Click **Save**

### Step 5: Get Test Tokens
1. Visit: https://faucet.qday.info/en
2. Paste your MetaMask wallet address
3. Request both **tUSD8** and **tQDAY**
4. Wait ~30 seconds

### Step 6: Deploy Contract
1. In Remix, click **Deploy & Run Transactions** icon (🚀)
2. Environment: **Injected Provider - MetaMask**
3. Account: your wallet address
4. Contract: **AutoTaskerPaymentRouterV2**
5. Constructor arguments:
   - `_tUSD8`: `0x456569838f1d43009A91ebA4263147Afd7233483`
   - `_houseWallet`: `0x74a9f91763c28571af7a52987f425f62825cf5d8`
6. Click **Deploy** → Confirm in MetaMask

### Step 7: Record Results
After deployment succeeds:
- Copy **Contract Address**
- Copy **Transaction Hash**
- Save to `data/deployments/qday-deployment.json`

---

## Option 2: Node.js Script (If You Have Private Key)

```bash
cd repos/autotasker-hub-aevum
npm install ethers@6 solc
export PRIVATE_KEY=0xYourPrivateKeyHere
node scripts/deploy-via-solc.js
```

---

## Option 3: Foundry (Best for Testing)

### Install Foundry
```powershell
# Method A: Chocolatey (if available)
choco install foundry

# Method B: Manual download from GitHub releases
# Download: foundry_v1.9.0_win32_amd64.zip
# Extract to: %USERPROFILE%\.foundry\bin\
# Add to PATH

# Method C: Scoop
scoop bucket add extras
scoop install foundry
```

### After Installation
```bash
cd repos/autotasker-hub-aevum
forge build
forge test --match-contract AutoTaskerPaymentRouterV2Test -vvv
forge script script/Deploy.s.sol --rpc-url https://rpc-test.qday.info --broadcast
```

---

## What to Test After Deployment

### 1. Check Contract Balance
```javascript
// In Remix "Deploy & Run" panel, call:
getBalance() → should return 0 initially
```

### 2. Approve tUSD8 Spending
Go to tUSD8 contract on explorer, call:
```
approve(<YOUR_ROUTER_ADDRESS>, 100000)  // approve $0.10
```

### 3. Submit Payment
In Remix, call:
```
submitPayment("hotlist", <PROVIDER_ADDRESS>, 60, <REFERRER_ADDRESS_OR_ZERO>)
```

### 4. Fulfill Request
Call:
```
fulfillRequest(<REQUEST_ID>, <PROVIDER_ADDRESS>)
```

### 5. Verify House Wallet Received Funds
Check balance of house wallet or call `getDashboard()`

---

## Commission Logic (Verified)

For each $0.05 payment:
- **House wallet** receives: ~$0.0448 (90% minus 50bps fee)
- **Referrer** receives: ~$0.0050 (10%) — auto-paid out when ≥$0.05 accumulated
- **Router treasury**: keeps 50bps ($0.00025) for operations

All funds go to **real wallets** on **real blockchain** — verifiable on explorer.

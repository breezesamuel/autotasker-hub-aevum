# Quick Start Guide — Deploy on QDay Testnet Without Foundry

## Option 1: Remix IDE (Easiest, Recommended)

### Step 1: Open Remix
Go to https://remix.ethereum.org

### Step 2: Create Contract
1. Click "File Explorer" icon (left sidebar)
2. Click "+" to create new file
3. Name it `AutoTaskerPaymentRouter.sol`
4. Paste the contract code from `contracts/AutoTaskerPaymentRouter.sol`

### Step 3: Compile
1. Click "Solidity Compiler" icon (left sidebar)
2. Select compiler version **0.8.20**
3. Click "Compile AutoTaskerPaymentRouter.sol"
4. ✅ Should show green checkmark

### Step 4: Deploy
1. Click "Deploy & Run Transactions" icon
2. Environment: **Injected Provider - MetaMask**
3. Connect MetaMask → switch to QDay Aevum testnet:
   - Network name: QDay Aevum Testnet
   - RPC URL: `https://rpc-test.qday.info`
   - Chain ID: **44005**
   - Currency symbol: tQDAY
4. Contract: AutoTaskerPaymentRouter
5. Constructor arguments:
   - `_tUSD8`: `0x456569838f1d43009A91ebA4263147Afd7233483`
6. Click **Deploy**
7. Confirm in MetaMask

### Step 5: Verify on Explorer
After deployment, copy the contract address and visit:
https://explorer-test.qday.info/address/<YOUR_CONTRACT_ADDRESS>

---

## Option 2: Use Deploy Script (If You Have Private Key)

```bash
# 1. Install ethers.js
cd repos/autotasker-hub-aevum
npm install ethers@6

# 2. Get your private key (from MetaMask export)
export PRIVATE_KEY=0xYourPrivateKeyHere

# 3. Run deployment
node scripts/deploy-no-foundry.js $PRIVATE_KEY
```

⚠️ **Never commit private keys!** Use environment variables or .env files.

---

## Option 3: Install Foundry (Full Workflow)

### Windows (PowerShell as Admin):
```powershell
# Via Chocolatey
choco install foundry

# Or via Scoop
scoop install foundry

# Or manual download
irm https://foundry.paradigm.xyz | iex
foundryup
```

### After installation:
```bash
cd repos/autotasker-hub-aevum
forge build
forge test
forge script script/Deploy.s.sol --rpc-url https://rpc-test.qday.info --broadcast
```

---

## Faucet (Get Test Tokens)

1. Go to https://faucet.qday.info/en
2. Paste your wallet address
3. Request tUSD8 and tQDAY tokens
4. Wait ~30 seconds for tokens to arrive

---

## Test Your Contract

Once deployed, test with these cast commands:

```bash
# Check contract balance
cast call <CONTRACT_ADDRESS> "getBalance()(uint256)" --rpc-url https://rpc-test.qday.info

# Submit payment (requires prior tUSD8 approval)
cast send <CONTRACT_ADDRESS> "submitPayment(string,address,uint256)" \
  "hotlist" <PROVIDER_ADDRESS> 60 \
  --private-key $PRIVATE_KEY --rpc-url https://rpc-test.qday.info

# Check request details
cast call <CONTRACT_ADDRESS> "getRequest(bytes32)(address,uint256,string,bool,uint256)" \
  <REQUEST_ID> --rpc-url https://rpc-test.qday.info
```

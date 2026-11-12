// Compile and deploy using solc-js + ethers.js — no Foundry/Hardhat needed
const { solc } = require('solc');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const CONTRACTS_DIR = path.join(__dirname, '..', 'contracts');
const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483';
const HOUSE_WALLET = process.env.HOUSE_WALLET || '0x74a9f91763c28571af7a52987f425f62825cf5d8';
const RPC_URL = 'https://rpc-test.qday.info';

async function compile() {
  console.log('=== Compiling AutoTaskerPaymentRouterV2 ===\n');
  
  // Read all source files
  const sourcePath = path.join(CONTRACTS_DIR, 'AutoTaskerPaymentRouterV2.sol');
  const source = fs.readFileSync(sourcePath, 'utf8');
  
  const input = {
    language: 'Solidity',
    sources: {
      'AutoTaskerPaymentRouterV2.sol': { content: source },
    },
    settings: {
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.sourceMap'] }
      },
      optimizer: { enabled: true, runs: 200 },
    },
  };
  
  // Compile via solc-js HTTP API (free, no install)
  const res = await fetch('https://compiler.zinc.cloud/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_code: source, contract_name: 'AutoTaskerPaymentRouterV2', solc_version: '0.8.20' }),
    signal: AbortSignal.timeout(60000),
  });
  
  if (!res.ok) {
    console.log(`Compiler API error: ${res.status}`);
    // Fallback: try remix-api
    return compileViaRemixApi(source);
  }
  
  const result = await res.json();
  console.log('Compilation result:', JSON.stringify(result).slice(0, 200));
  
  // Save artifacts
  const outDir = path.join(__dirname, '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const artifactPath = path.join(outDir, 'AutoTaskerPaymentRouterV2.json');
  fs.writeFileSync(artifactPath, JSON.stringify({ abi: result.abi, bytecode: result.bytecode }, null, 2));
  console.log(`\nArtifact saved: ${artifactPath}\n`);
  
  return { abi: result.abi, bytecode: result.bytecode };
}

async function compileViaRemixApi(source) {
  console.log('Trying alternative compiler...\n');
  const res = await fetch('https://solc-bin.ethereum.org/windows-soljson-v0.8.20+commit.a1b7 e33b.js', { 
    signal: AbortSignal.timeout(30000) 
  });
  if (!res.ok) throw new Error('No compiler available');
  // ... simplified fallback
  throw new Error('Cannot compile without internet access to solidity compiler');
}

async function deploy(abi, bytecode) {
  console.log('\n=== Deploying to QDay Aevum Testnet ===\n');
  
  // Check if private key is provided
  const privateKey = process.argv[2] || process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.log('Usage: node scripts/deploy-via-solc.js <PRIVATE_KEY>');
    console.log('Or set PRIVATE_KEY environment variable');
    console.log('\nTo get a test wallet:');
    console.log('  1. Install MetaMask (https://metamask.io)');
    console.log('  2. Create new wallet');
    console.log('  3. Export private key: Settings → Security → Export Private Key');
    console.log('  4. Run: node scripts/deploy-via-solc.js <your_key>');
    return;
  }
  
  // Connect to testnet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log(`Wallet: ${wallet.address}`);
  
  // Check balance
  const nativeBal = await provider.getBalance(wallet.address);
  console.log(`tQDAY balance: ${ethers.formatEther(nativeBal)}`);
  
  // Check tUSD8 balance
  try {
    const tusd8 = new ethers.Contract(TUSD8_ADDRESS, [
      'function balanceOf(address) view returns (uint256)',
      'function symbol() view returns (string)',
    ], provider);
    const tusdBal = await tusd8.balanceOf(wallet.address);
    console.log(`tUSD8 balance: ${ethers.formatUnits(tusdBal, 6)}`);
  } catch(e) {
    console.log('tUSD8 contract not found at expected address');
  }
  
  // Deploy!
  console.log('\nDeploying contract...');
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(TUSD8_ADDRESS, HOUSE_WALLET);
  console.log('Waiting for confirmation...');
  await contract.waitForDeployment();
  
  const addr = await contract.getAddress();
  console.log('\n' + '='.repeat(50));
  console.log('✅ DEPLOYED SUCCESSFULLY!');
  console.log('='.repeat(50));
  console.log(`Contract Address: ${addr}`);
  console.log(`Explorer: https://explorer-test.qday.info/address/${addr}`);
  console.log(`Network: QDay Aevum Testnet (chainId 44005)`);
  console.log(`tUSD8 Token: ${TUSD8_ADDRESS}`);
  console.log(`House Wallet: ${HOUSE_WALLET}`);
  console.log('='.repeat(50));
  
  // Save deployment info
  const savesDir = path.join(__dirname, '..', 'data', 'deployments');
  fs.mkdirSync(savesDir, { recursive: true });
  const deployInfo = {
    deployedAt: new Date().toISOString(),
    network: 'qday-testnet',
    chainId: 44005,
    contractAddress: addr,
    tUSD8Address: TUSD8_ADDRESS,
    houseWallet: HOUSE_WALLET,
    deployer: wallet.address,
    explorerUrl: `https://explorer-test.qday.info/address/${addr}`,
    txHash: (await contract.deploymentTransaction())?.hash || null,
  };
  const savePath = path.join(savesDir, `deployment-${Date.now()}.json`);
  fs.writeFileSync(savePath, JSON.stringify(deployInfo, null, 2));
  console.log(`\n💾 Saved to: ${savePath}`);
}

(async () => {
  try {
    const { abi, bytecode } = await compile();
    await deploy(abi, bytecode);
  } catch (err) {
    console.error('\n❌ Deployment failed:', err.message);
    console.log('\nFALLBACK OPTIONS:');
    console.log('1. Use Remix IDE: https://remix.ethereum.org');
    console.log('   - Paste contract code from contracts/AutoTaskerPaymentRouterV2.sol');
    console.log('   - Compile with Solidity 0.8.20');
    console.log('   - Deploy with MetaMask connected to QDay testnet');
    console.log('2. Use Tenderly: https://tenderly.co');
    console.log('3. Install Foundry manually and run: forge build && forge script script/Deploy.s.sol --broadcast');
    process.exit(1);
  }
})();

// quick-deploy.js — Deploy using solc-js directly in Node.js (no Foundry needed)
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'AutoTaskerPaymentRouterV2.sol');
const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483';
const HOUSE_WALLET = process.argv[2] || '0x74a9f91763c28571af7a52987f425f62825cf5d8';
const RPC_URL = 'https://rpc-test.qday.info';

async function compileViaSolUI() {
  console.log('[1] Compiling via SolUI compiler API...\n');
  
  const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
  
  // Use Remix's public compiler API
  const res = await fetch('https://compiler-api.zinccloud.io/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: [{ name: 'contract.sol', content: source }],
      settings: { optimizer: { enabled: true, runs: 200 } },
    }),
    signal: AbortSignal.timeout(30000),
  });
  
  if (!res.ok) {
    console.log(`SolUI failed (${res.status}), trying alternative...`);
    return null;
  }
  
  const data = await res.json();
  return data;
}

async function main() {
  console.log('=== Quick Deploy Script ===\n');
  console.log(`Target: QDay Aevum Testnet (chainId 44005)`);
  console.log(`tUSD8:  ${TUSD8_ADDRESS}`);
  console.log(`House:  ${HOUSE_WALLET}\n`);
  
  // Check if private key provided
  const privateKey = process.argv[3] || process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.log('Usage: node quick-deploy.js <house_wallet> <private_key>');
    console.log('\nTo get a test wallet:');
    console.log('  1. Install MetaMask (https://metamask.io)');
    console.log('  2. Create new wallet');
    console.log('  3. Settings → Security → Export Private Key');
    console.log('  4. Run: node quick-deploy.js 0xYourHouseWallet 0xYourPrivateKey\n');
    console.log('Or set PRIVATE_KEY env var.');
    return;
  }
  
  // Step 1: Compile
  console.log('[1] Compiling contract...');
  let artifact = null;
  
  // Try multiple compiler APIs
  const compilers = [
    {
      name: 'SolUI',
      url: 'https://compiler-api.zinccloud.io/compile',
      build: async (source) => {
        const r = await fetch(compilers[0].url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources: [{ name: 'contract.sol', content: source }], settings: { optimizer: { enabled: true } } }),
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }
    },
  ];
  
  for (const comp of compilers) {
    try {
      console.log(`   Trying ${comp.name}...`);
      artifact = await comp.build(fs.readFileSync(CONTRACT_PATH, 'utf8'));
      console.log(`   ✓ Compiled via ${comp.name}`);
      break;
    } catch(e) {
      console.log(`   ✗ ${comp.name} failed: ${e.message.slice(0, 80)}`);
    }
  }
  
  if (!artifact) {
    console.log('\n⚠️  All compiler APIs failed.');
    console.log('FALLBACK: Use Remix IDE manually:');
    console.log('  1. Open https://remix.ethereum.org');
    console.log('  2. Create file → paste contracts/AutoTaskerPaymentRouterV2.sol');
    console.log('  3. Compile with Solidity 0.8.20');
    console.log('  4. Deploy with MetaMask on QDay testnet');
    return;
  }
  
  // Step 2: Connect wallet
  console.log('\n[2] Connecting to QDay testnet...');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`   Wallet: ${wallet.address}`);
  
  // Check balances
  const nativeBal = await provider.getBalance(wallet.address);
  console.log(`   tQDAY: ${ethers.formatEther(nativeBal)}`);
  
  try {
    const tusd8 = new ethers.Contract(TUSD8_ADDRESS, ['function balanceOf(address) view returns (uint256)'], provider);
    const tusdBal = await tusd8.balanceOf(wallet.address);
    console.log(`   tUSD8: ${ethers.formatUnits(tusdBal, 6)}`);
  } catch(e) {
    console.log('   tUSD8 balance: error loading');
  }
  
  // Step 3: Deploy
  console.log('\n[3] Deploying contract...');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  try {
    const contract = await factory.deploy(TUSD8_ADDRESS, HOUSE_WALLET);
    console.log('   Waiting for confirmation...');
    await contract.waitForDeployment();
    
    const addr = await contract.getAddress();
    console.log('\n' + '='.repeat(60));
    console.log('✅ DEPLOYED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`   Contract: ${addr}`);
    console.log(`   Explorer: https://explorer-test.qday.info/address/${addr}`);
    console.log(`   Network:  QDay Aevum Testnet (chainId 44005)`);
    console.log(`   tUSD8:    ${TUSD8_ADDRESS}`);
    console.log(`   House:    ${HOUSE_WALLET}`);
    console.log('='.repeat(60));
    
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
      artifactPath: path.join(__dirname, '..', 'out', 'AutoTaskerPaymentRouterV2.json'),
    };
    const savePath = path.join(savesDir, `deployment-${Date.now()}.json`;
    fs.writeFileSync(savePath, JSON.stringify(deployInfo, null, 2));
    console.log(`\n💾 Saved to: ${savePath}`);
    
    // Also update README
    const readmePath = path.join(__dirname, '..', 'README.md');
    if (fs.existsSync(readmePath)) {
      let readme = fs.readFileSync(readmePath, 'utf8');
      readme = readme.replace(/0x0000000000000000000000000000000000000000/g, addr);
      fs.writeFileSync(readmePath, readme);
      console.log('📝 Updated README.md with contract address');
    }
    
  } catch(err) {
    console.error('\n❌ Deployment failed:', err.message);
    if (err.reason) console.error('   Reason:', err.reason);
    if (err.data) console.error('   Data:', String(err.data).slice(0, 200));
  }
}

main().catch(console.error);

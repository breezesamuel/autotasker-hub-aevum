// Deploy contract without Foundry — uses raw bytecode from compiled artifact
// Run: node deploy-no-foundry.js <PRIVATE_KEY>
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483';
const RPC_URL = 'https://rpc-test.qday.info';

async function main() {
  const privateKey = process.argv[2] || process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.log('Usage: node deploy-no-foundry.js <PRIVATE_KEY>');
    console.log('Get a test wallet: https://metamask.io');
    console.log('Get test tokens: https://faucet.qday.info/en');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log('=== AutoTaskerPaymentRouter Deploy ===');
  console.log(`Wallet: ${wallet.address}`);
  
  // Check balances
  const nativeBal = await provider.getBalance(wallet.address);
  console.log(`tQDAY: ${ethers.formatEther(nativeBal)}`);
  
  const tusd8 = new ethers.Contract(TUSD8_ADDRESS, [
    'function balanceOf(address) view returns (uint256)',
    'function symbol() view returns (string)',
  ], provider);
  const tusdBal = await tusd8.balanceOf(wallet.address);
  console.log(`tUSD8: ${ethers.formatUnits(tusdBal, 6)}`);
  
  // Load contract bytecode
  const artifactPath = path.join(__dirname, '..', 'out', 'AutoTaskerPaymentRouter.sol', 'AutoTaskerPaymentRouter.json');
  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    console.log('\nLoaded artifact from:', artifactPath);
  } catch (e) {
    console.log('\n⚠️ No compiled artifact found at:', artifactPath);
    console.log('Run: forge build');
    console.log('Or use Remix IDE instead.');
    process.exit(1);
  }
  
  // Deploy
  console.log('\n🚀 Deploying...');
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode.object,
    wallet
  );
  
  const contract = await factory.deploy(TUSD8_ADDRESS);
  console.log('Waiting for confirmation...');
  await contract.waitForDeployment();
  
  const addr = await contract.getAddress();
  console.log('\n✅ DEPLOYED!');
  console.log(`   Address: ${addr}`);
  console.log(`   Explorer: ${RPC_URL}/address/${addr}`);
  console.log(`   Network: QDay Aevum Testnet (chainId 44005)`);
  
  // Save deployment info
  const savesDir = path.join(__dirname, '..', 'data', 'deployments');
  fs.mkdirSync(savesDir, { recursive: true });
  const deployInfo = {
    deployedAt: new Date().toISOString(),
    network: 'qday-testnet',
    chainId: 44005,
    contractAddress: addr,
    tUSD8Address: TUSD8_ADDRESS,
    deployer: wallet.address,
    explorerUrl: `https://explorer-test.qday.info/address/${addr}`,
    txHash: (await contract.deploymentTransaction())?.hash || null,
  };
  const savePath = path.join(savesDir, `deployment-${Date.now()}.json`);
  fs.writeFileSync(savePath, JSON.stringify(deployInfo, null, 2));
  console.log(`\n💾 Saved to: ${savePath}`);
}

main().catch(err => { console.error(err); process.exit(1); });

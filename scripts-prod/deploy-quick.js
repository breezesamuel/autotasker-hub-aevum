// Quick Deploy via Etherscan-style verification
// If Foundry isn't available, use this script to deploy via web3 provider
const { ethers } = require('ethers');

const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483';
const RPC_URL = 'https://rpc-test.qday.info';

// Contract ABI (minimal — only what we need)
const ROUTER_ABI = [
  'constructor(address _tUSD8)',
  'function submitPayment(string calldata toolName, address provider, uint256 maxTimeoutSeconds) external returns (bytes32)',
  'function fulfillRequest(bytes32 requestId, address provider) external',
  'function getRequest(bytes32) external view returns (address, uint256, string, bool, uint256)',
  'function getBalance() external view returns (uint256)',
  'function withdraw(uint256 amount) external',
  'event PaymentReceived(address indexed payer, address indexed provider, uint256 amount, bytes32 indexed requestId, string toolName)',
  'event RequestCreated(bytes32 indexed requestId, address indexed payer, string toolName, uint256 price)',
  'event Withdrawal(address indexed owner, uint256 amount)',
];

async function main() {
  console.log('=== AutoTaskerPaymentRouter Deploy Script ===\n');
  
  // Check if we have a private key in env or args
  const privateKey = process.argv[2] || process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.log('Usage: node deploy.js <private_key>');
    console.log('Or set PRIVATE_KEY env var');
    console.log('\nNote: Never commit real private keys! Use a dedicated test wallet.');
    return;
  }
  
  // Connect to testnet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log(`Wallet: ${wallet.address}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Chain: 44005 (QDay Aevum Testnet)`);
  
  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`Native token balance: ${ethers.formatEther(balance)} tQDAY`);
  
  // Check tUSD8 balance
  const tusd8 = new ethers.Contract(TUSD8_ADDRESS, [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ], provider);
  
  const tusdBalance = await tusd8.balanceOf(wallet.address);
  console.log(`tUSD8 balance: ${ethers.formatUnits(tusdBalance, 6)} USDC`);
  
  if (tusdBalance === 0n) {
    console.log('\n⚠️ No tUSD8 tokens! Get some from: https://faucet.qday.info/en');
  }
  
  // Read contract bytecode from compiled output
  const fs = require('fs');
  const path = require('path');
  const contractDir = path.resolve(__dirname, '..', 'contracts');
  
  // Look for compiled JSON in out/ directory
  const outDir = path.join(__dirname, '..', 'out');
  let artifact = null;
  let artifactPath = '';
  
  if (fs.existsSync(outDir)) {
    const files = fs.readdirSync(outDir).filter(f => f.includes('AutoTaskerPaymentRouter') && f.endsWith('.json'));
    if (files.length > 0) {
      artifactPath = path.join(outDir, files[0]);
      artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      console.log(`\nUsing artifact: ${files[0]}`);
    }
  }
  
  if (!artifact) {
    console.log('\n⚠️ No compiled contract found.');
    console.log('To compile: forge build (requires Foundry)');
    console.log('Or use Remix IDE: https://remix.ethereum.org');
    return;
  }
  
  // Deploy!
  console.log('\n🚀 Deploying AutoTaskerPaymentRouter...');
  const factory = new ethers.ContractFactory(ROUTER_ABI, artifact.bytecode.object, wallet);
  const contract = await factory.deploy(TUSD8_ADDRESS);
  await contract.waitForDeployment();
  
  const deployedAddress = await contract.getAddress();
  console.log('\n✅ DEPLOYED SUCCESSFULLY!');
  console.log(`   Address: ${deployedAddress}`);
  console.log(`   Explorer: https://explorer-test.qday.info/address/${deployedAddress}`);
  console.log(`   Network: QDay Aevum Testnet (chainId 44005)`);
  
  // Save deployment info
  const deployInfo = {
    deployedAt: new Date().toISOString(),
    network: 'qday-testnet',
    chainId: 44005,
    contractAddress: deployedAddress,
    tUSD8Address: TUSD8_ADDRESS,
    deployer: wallet.address,
    explorerUrl: `https://explorer-test.qday.info/address/${deployedAddress}`,
  };
  
  const savesDir = path.join(__dirname, '..', 'data', 'deployments');
  fs.mkdirSync(savesDir, { recursive: true });
  const savePath = path.join(savesDir, `deployment-${Date.now()}.json`);
  fs.writeFileSync(savePath, JSON.stringify(deployInfo, null, 2));
  console.log(`\n💾 Saved to: ${savePath}`);
}

main().catch(err => {
  console.error('\n❌ Deployment failed:', err.message);
  process.exit(1);
});

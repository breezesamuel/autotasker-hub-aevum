// Deploy directly using solc-js compiled contract bytecode
// No Foundry needed — just Node.js + ethers.js
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const TUSD8 = '0x456569838f1d43009A91ebA4263147Afd7233483';
const HOUSE = process.argv[2] || '0x74a9f91763c28571af7a52987f425f62825cf5d8';
const RPC = 'https://rpc-test.qday.info';
const PK = process.argv[3] || process.env.PRIVATE_KEY;

async function main() {
  console.log('\n=== Quick Deploy: AutoTaskerPaymentRouterV2 ===\n');
  console.log(`RPC:        ${RPC}`);
  console.log(`tUSD8:      ${TUSD8}`);
  console.log(`House Wallet: ${HOUSE}`);
  
  if (!PK) {
    console.log('\n⚠️  No private key provided.');
    console.log('Usage: node deploy-direct.js <house_wallet> <private_key>');
    console.log('Or set PRIVATE_KEY env var.');
    console.log('\nTo get test tokens: https://faucet.qday.info/en');
    return;
  }
  
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  console.log(`\nWallet: ${wallet.address}`);
  
  // Check balances
  const nativeBal = await provider.getBalance(wallet.address);
  console.log(`tQDAY: ${ethers.formatEther(nativeBal)}`);
  
  try {
    const tusd8 = new ethers.Contract(TUSD8, ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'], provider);
    const tusdBal = await tusd8.balanceOf(wallet.address);
    console.log(`tUSD8: ${ethers.formatUnits(tusdBal, 6)}`);
    console.log(`Symbol: ${await tusd8.symbol()}`);
  } catch(e) { console.log('tUSD8 check failed:', e.message.slice(0, 80)); }
  
  // Compile via online Solidity compiler
  console.log('\n🔨 Compiling via online Solidity compiler...');
  
  const source = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'AutoTaskerPaymentRouterV2.sol'), 'utf8');
  
  // Try multiple compiler APIs
  const compilerAPIs = [
    { name: 'ZincCloud', url: 'https://compiler.zinc.cloud/compile', body: s => ({ source_code: s, contract_name: 'AutoTaskerPaymentRouterV2', solc_version: '0.8.20' }) },
    { name: 'SolidityCompiler', url: 'https://solc.codes/api/compile', body: s => ({ sol: s, version: '0.8.20' }) },
  ];
  
  let artifact = null;
  for (const api of compilerAPIs) {
    try {
      console.log(`   Trying ${api.name}...`);
      const res = await fetch(api.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(api.body(source)),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.contract?.abi && data?.contract?.bytecode) {
          artifact = { abi: data.contract.abi, bytecode: data.contract.bytecode };
          console.log(`   ✓ Compiled via ${api.name}`);
          break;
        }
      }
    } catch(e) { console.log(`   ✗ ${api.name}: ${e.message.slice(0, 60)}`); }
  }
  
  if (!artifact) {
    console.log('\n❌ All compiler APIs failed.');
    console.log('\nFALLBACK — Use Remix IDE manually:');
    console.log('1. https://remix.ethereum.org');
    console.log('2. Create file → paste contract code');
    console.log('3. Compile (Solidity 0.8.20)');
    console.log('4. Deploy with MetaMask on QDay testnet');
    console.log('   Constructor args:');
    console.log(`   - _tUSD8: ${TUSD8}`);
    console.log(`   - _houseWallet: ${HOUSE}`);
    return;
  }
  
  // Deploy!
  console.log('\n🚀 Deploying...\n');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  try {
    const tx = await factory.deploy(TUSD8, HOUSE);
    console.log('   Transaction sent:', tx.hash);
    console.log('   Waiting for confirmation...');
    
    const receipt = await tx.wait();
    const addr = await factory.deployed().then(c => c.getAddress()).catch(() => receipt?.contractAddress);
    
    if (!addr) {
      // Try getting address from receipt
      console.log('   Receipt:', JSON.stringify(receipt).slice(0, 500));
      return;
    }
    
    console.log('\n' + '█'.repeat(60));
    console.log('✅ DEPLOYED SUCCESSFULLY!');
    console.log('█'.repeat(60));
    console.log(`   Contract: ${addr}`);
    console.log(`   Tx Hash:  ${receipt?.transactionHash || tx.hash}`);
    console.log(`   Block:    ${receipt?.blockNumber || '?'}`);
    console.log(`   Explorer: https://explorer-test.qday.info/address/${addr}`);
    console.log(`   Network:  QDay Aevum Testnet (chainId 44005)`);
    console.log('█'.repeat(60));
    
    // Save
    const savesDir = path.join(__dirname, '..', 'data', 'deployments');
    fs.mkdirSync(savesDir, { recursive: true });
    const info = {
      deployedAt: new Date().toISOString(),
      network: 'qday-testnet', chainId: 44005,
      contractAddress: addr, tUSD8Address: TUSD8,
      houseWallet: HOUSE, deployer: wallet.address,
      explorerUrl: `https://explorer-test.qday.info/address/${addr}`,
      txHash: receipt?.transactionHash || tx.hash,
      blockNumber: receipt?.blockNumber,
    };
    fs.writeFileSync(path.join(savesDir, `deployment-${Date.now()}.json`), JSON.stringify(info, null, 2));
    console.log(`\n💾 Saved: ${path.join(savesDir, 'deployment-latest.json')}`);
    
  } catch(err) {
    console.error('\n❌ Deployment failed:', err.reason || err.message);
    if (err.data) console.error('   Raw:', String(err.data).slice(0, 300));
  }
}

main().catch(console.error);

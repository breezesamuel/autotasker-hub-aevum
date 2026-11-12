/**
 * Hardhat deployment script for AutoTaskerPaymentRouterV2
 * Works without Foundry — just need Node.js + ethers.js
 * 
 * Usage: npx hardhat run scripts/hardhat-deploy.js --network qdayTestnet
 */
require('@nomicfoundation/hardhat-toolbox');

const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483';
const HOUSE_WALLET = process.env.HOUSE_WALLET || '0x74a9f91763c28571af7a52987f425f62825cf5d8';

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  
  console.log('\n==========================================');
  console.log('  AutoTaskerPaymentRouterV2 Deployment');
  console.log('==========================================\n');
  console.log(`Network: ${hre.network.name}`);
  console.log(`Deployer: ${deployer}`);
  console.log(`tUSD8:    ${TUSD8_ADDRESS}`);
  console.log(`House:    ${HOUSE_WALLET}`);
  
  // Deploy
  const result = await deploy('AutoTaskerPaymentRouterV2', {
    from: deployer,
    args: [TUSD8_ADDRESS, HOUSE_WALLET],
    log: true,
    waitConfirmations: 1,
  });
  
  console.log('\n✅ DEPLOYED!');
  console.log(`   Contract: ${result.address}`);
  console.log(`   Tx Hash:  ${result.receipt?.transactionHash || 'pending'}`);
  console.log(`   Explorer: https://explorer-test.qday.info/address/${result.address}`);
  console.log('\n==========================================\n');
};

module.exports.tags = ['AutoTaskerPaymentRouterV2'];

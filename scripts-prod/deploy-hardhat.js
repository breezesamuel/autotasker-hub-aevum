// Alternative deployment using ethers.js (no Foundry needed)
const hre = require("hardhat");

async function main() {
  const TUSD8_ADDRESS = "0x456569838f1d43009A91ebA4263147Afd7233483";
  
  console.log("=== Deploying AutoTaskerPaymentRouter ===");
  console.log(`Network: ${hre.network.name}`);
  console.log(`tUSD8: ${TUSD8_ADDRESS}`);
  
  const Router = await hre.ethers.getContractFactory("AutoTaskerPaymentRouter");
  const router = await Router.deploy(TUSD8_ADDRESS);
  await router.waitForDeployment();
  
  const address = await router.getAddress();
  console.log(`\n✓ Deployed at: ${address}`);
  console.log(`  Explorer: https://explorer-test.qday.info/address/${address}`);
  
  // Verify on explorer (if API key available)
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\nVerifying on explorer...");
    await hre.run("verify:verify", {
      address,
      constructorArguments: [TUSD8_ADDRESS],
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

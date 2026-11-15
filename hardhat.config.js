require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    qdayTestnet: {
      url: process.env.RPC_URL || "https://rpc-test.qday.info",
      chainId: 44005,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      qdayTestnet: process.env.EXPLORER_API_KEY || "",
    },
    customChains: [
      {
        network: "qdayTestnet",
        chainId: 44005,
        urls: {
          apiURL: "https://explorer-test.qday.info/api",
          browserURL: "https://explorer-test.qday.info",
        },
      },
    ],
  },
};

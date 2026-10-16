import { existsSync } from "node:fs";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, type HardhatUserConfig } from "hardhat/config";

// Hardhat 3 does not load .env files automatically. Load it (if present) so
// configVariable and the deploy scripts can read SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY,
// ETHERSCAN_API_KEY and OWNER_ADDRESS from contracts/.env.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.28",
    npmFilesToBuild: [
      "@semaphore-protocol/contracts/Semaphore.sol",
      "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol",
      "poseidon-solidity/PoseidonT3.sol"
    ],
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // Testnet deployment target. Secrets are read from env vars / the Hardhat keystore,
    // never from the config file. See deploy/README.md and .env.example.
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")]
    }
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY")
    }
  }
};

export default config;

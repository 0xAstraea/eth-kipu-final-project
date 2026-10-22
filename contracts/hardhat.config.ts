import { existsSync } from "node:fs";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, type HardhatUserConfig } from "hardhat/config";

// Hardhat 3 does not load .env files automatically. Load it (if present) so
// configVariable and the deploy scripts can read SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY,
// ETHERSCAN_API_KEY and OWNER_ADDRESS from contracts/.env.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const optimizer = { enabled: true, runs: 200 } as const;

/** Settings used for the Sepolia Semaphore stack (deployed without CBOR). */
const noCbor = {
  optimizer,
  metadata: { bytecodeHash: "none" as const, appendCBOR: false }
};

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: { optimizer }
        // Own contracts: default CBOR metadata (needed for Hardhat/Etherscan verify).
      }
    ],
    npmFilesToBuild: [
      "@semaphore-protocol/contracts/Semaphore.sol",
      "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol",
      "poseidon-solidity/PoseidonT3.sol"
    ],
    // Match the on-chain Semaphore stack bytecode (no CBOR) for dependency verification.
    overrides: {
      "poseidon-solidity/PoseidonT3.sol": {
        version: "0.8.28",
        settings: noCbor
      },
      "@semaphore-protocol/contracts/Semaphore.sol": {
        version: "0.8.28",
        settings: noCbor
      },
      "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol": {
        version: "0.8.28",
        settings: noCbor
      }
    }
  },
  networks: {
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

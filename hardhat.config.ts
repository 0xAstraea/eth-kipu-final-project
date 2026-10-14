import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import type { HardhatUserConfig } from "hardhat/config";

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
  }
};

export default config;

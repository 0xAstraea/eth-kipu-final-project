import hre from "hardhat";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const connection = await hre.network.create();

/// Verifies every contract of the deployment on the block explorer.
///
/// Usage:
///   pnpm run verify:sepolia
///
/// Reads deployments/<network>.json and submits the verification of each contract with
/// the constructor arguments it was deployed with.
async function main() {
  const networkName = connection.networkName;
  const statePath = join(process.cwd(), "deployments", `${networkName}.json`);

  if (!existsSync(statePath)) {
    throw new Error(`No deployment found at ${statePath}. Run deploy/deploy.ts first.`);
  }

  const state = JSON.parse(readFileSync(statePath, "utf8"));

  const librariesPath = join(process.cwd(), "deployments", "libraries.mjs");
  mkdirSync(join(librariesPath, ".."), { recursive: true });
  writeFileSync(
    librariesPath,
    `export default ${JSON.stringify(
      { "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3": state.poseidonT3 },
      null,
      2
    )};\n`
  );

  const targets = [
    {
      label: "TeamRegistry",
      address: state.teamRegistry,
      contract: "contracts/TeamRegistry.sol:TeamRegistry",
      args: [state.semaphore]
    },
    {
      label: "TeamCredential",
      address: state.teamCredential,
      contract: "contracts/TeamCredential.sol:TeamCredential",
      args: [state.teamRegistry]
    },
    {
      label: "Semaphore",
      address: state.semaphore,
      contract: "@semaphore-protocol/contracts/Semaphore.sol:Semaphore",
      args: [state.semaphoreVerifier],
      libraries: true
    },
    {
      label: "SemaphoreVerifier",
      address: state.semaphoreVerifier,
      contract: "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol:SemaphoreVerifier",
      args: []
    },
    {
      label: "PoseidonT3",
      address: state.poseidonT3,
      contract: "poseidon-solidity/PoseidonT3.sol:PoseidonT3",
      args: []
    }
  ];

  console.log(`Verifying ${targets.length} contracts on '${networkName}'`);

  const verifyTask = hre.tasks.getTask("verify");

  for (const target of targets) {
    try {
      await verifyTask.run({
        address: target.address,
        constructorArgs: target.args,
        contract: target.contract,
        librariesPath: target.libraries ? librariesPath : undefined
      });
      console.log(`submitted ${target.label} ${target.address}`);
    } catch (error: any) {
      console.log(`FAILED ${target.label} ${target.address}: ${error.shortMessage ?? error.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

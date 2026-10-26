import hre from "hardhat";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const connection = await hre.network.create();

/// Verifies contracts from deployments/<network>.json on the block explorer.
///
/// By default only **own** contracts (TeamRegistry, TeamCredential) — what the
/// course checklist requires. Dependency stack (Semaphore / Poseidon) is skipped
/// unless VERIFY_DEPS=1 (those addresses must have been deployed with CBOR metadata).
///
/// Usage:
///   pnpm run verify:sepolia
///   VERIFY_DEPS=1 pnpm run verify:sepolia
async function main() {
  const networkName = connection.networkName;
  const statePath = join(process.cwd(), "deployments", `${networkName}.json`);

  if (!existsSync(statePath)) {
    throw new Error(`No deployment found at ${statePath}. Run deploy/deploy.ts first.`);
  }

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const verifyDeps = (process.env.VERIFY_DEPS ?? "").trim() === "1";

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

  const own = [
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
    }
  ];

  const deps = [
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

  const targets = verifyDeps ? [...own, ...deps] : own;
  console.log(
    verifyDeps
      ? `Verifying own contracts + Semaphore stack on '${networkName}'`
      : `Verifying own contracts on '${networkName}' (set VERIFY_DEPS=1 to include Semaphore stack)`
  );

  const verifyTask = hre.tasks.getTask("verify");

  for (const target of targets) {
    try {
      await verifyTask.run({
        address: target.address,
        constructorArgs: target.args,
        contract: target.contract,
        librariesPath: "libraries" in target && target.libraries ? librariesPath : undefined
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

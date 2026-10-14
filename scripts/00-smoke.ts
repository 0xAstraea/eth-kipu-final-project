import hre from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

const { ethers } = await hre.network.create();

/**
 * Smoke test: verifies that the whole Semaphore pipeline works locally
 * before writing any of our own contract logic.
 *
 * 1. Deploy SemaphoreVerifier + Semaphore
 * 2. Create a group (admin = deployer, simulating the course owner)
 * 3. Add a student identity commitment to the group
 * 4. Generate a ZK proof off-chain with the SDK
 * 5. Validate the proof on-chain
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  // 1. Deploy verifier + Semaphore core
  const verifier = await ethers.deployContract("SemaphoreVerifier");
  await verifier.waitForDeployment();
  console.log("SemaphoreVerifier:", await verifier.getAddress());

  const poseidonT3 = await ethers.deployContract("PoseidonT3");
  await poseidonT3.waitForDeployment();
  console.log("PoseidonT3:", await poseidonT3.getAddress());

  const semaphoreFactory = await ethers.getContractFactory("Semaphore", {
    libraries: {
      "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3": await poseidonT3.getAddress()
    }
  });
  const semaphore = await semaphoreFactory.deploy(await verifier.getAddress());
  await semaphore.waitForDeployment();
  console.log("Semaphore:", await semaphore.getAddress());

  // 2. Create group (admin = deployer = the course owner)
  await (await semaphore["createGroup(address)"](deployer.address)).wait();
  const groupId = 0n; // first group ever created

  // 3. Create a student identity and add it to the group
  const alice = new Identity("alice");
  await (await semaphore.addMember(groupId, alice.commitment)).wait();
  console.log("Added Alice, commitment:", alice.commitment.toString());

  // 4. Generate a ZK proof off-chain: "I am a member of the group"
  const group = new Group([alice.commitment]);
  const message = 42n;
  const scope = 1n;
  const proof = await generateProof(alice, group, message, scope);
  console.log("Proof generated:");
  console.log("  nullifier:", proof.nullifier.toString());
  console.log("  scope:", proof.scope.toString());

  // 5. Validate the proof on-chain (reverts if invalid or nullifier reused)
  await (await semaphore.validateProof(groupId, proof)).wait();
  console.log("PROOF VALIDATED ON-CHAIN - smoke test OK");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

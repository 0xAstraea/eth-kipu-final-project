import hre from "hardhat";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { claimCommitmentOf, joinMessageOf } from "../scripts/lib/protocol";

const connection = await hre.network.create();
const { ethers } = connection;

/// Runs the full TeamUp ZK flow against already-deployed contracts, producing real
/// on-chain transactions. Uses freshly generated (random) identities so no secret is
/// ever stored in the repository.
///
/// Usage:
///   npx hardhat run deploy/interact.ts --network sepolia
async function main() {
  const networkName = connection.networkName;
  const statePath = join(process.cwd(), "deployments", `${networkName}.json`);

  if (!existsSync(statePath)) {
    throw new Error(`No deployment found at ${statePath}. Run deploy/deploy.ts first.`);
  }

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  console.log(`Interacting with TeamRegistry at ${state.teamRegistry} on '${networkName}'`);

  const registry: any = await ethers.getContractAt("TeamRegistry", state.teamRegistry);
  const credential: any = await ethers.getContractAt("TeamCredential", state.teamCredential);
  const semaphore: any = await ethers.getContractAt("Semaphore", state.semaphore);

  // Use the current registry owner as the signer, so this script keeps working even if
  // ownership was handed off (OWNER_ADDRESS) to another node account at deploy time.
  const registryOwner = await registry.owner();
  const signers = await ethers.getSigners();
  const owner = signers.find((signer: any) => signer.address.toLowerCase() === registryOwner.toLowerCase());
  if (!owner) {
    throw new Error(
      `The course owner ${registryOwner} is not a local Hardhat account, so interact.ts cannot sign for it. ` +
        `Operate the owner-only steps from the frontend with that account instead (or unset OWNER_ADDRESS).`
    );
  }

  // This script rebuilds the off-chain group from the identities it enrolls, so it must
  // run on a fresh deployment (empty course group).
  const groupSize = await semaphore.getMerkleTreeSize(state.courseGroupId);
  if (groupSize !== 0n) {
    throw new Error(
      `The course group already has ${groupSize} member(s). Run interact.ts only on a fresh deployment.`
    );
  }

  // 1. Fresh identities (never hardcoded).
  const alice = new Identity();
  const bob = new Identity();
  const charlie = new Identity();

  // 2. The course owner enrolls them.
  for (const identity of [alice, bob, charlie]) {
    const tx = await registry.connect(owner).addCourseMember(identity.commitment);
    await tx.wait();
    console.log(`addCourseMember ${identity.commitment} -> ${tx.hash}`);
  }

  const commitments = [alice.commitment, bob.commitment, charlie.commitment];
  const group = new Group(commitments);

  // 3. Alice creates a team with a scoped ZK proof.
  const teamId = await registry.nextTeamId();
  const createProof = await generateProof(alice, group, 0n, teamId);
  const createTx = await registry
    .connect(owner)
    .createTeam("TeamUp ZK", "On-chain anonymous team", 3, 0, createProof);
  await createTx.wait();
  console.log(`createTeam #${teamId} -> ${createTx.hash}`);

  // 4. Bob applies from the same funded account (the sender is never stored).
  const bobPresentation = "Bob: smart contracts and testing";
  const bobSalt = BigInt("0x" + crypto.randomUUID().replace(/-/g, ""));
  const bobClaimAddress = ethers.Wallet.createRandom().address;
  const bobCommitment = claimCommitmentOf(bobClaimAddress, bobSalt);
  const bobProof = await generateProof(
    bob,
    group,
    joinMessageOf(bobPresentation, bobCommitment),
    teamId
  );
  const bobTx = await registry
    .connect(owner)
    .requestJoin(teamId, bobPresentation, bobCommitment, bobProof);
  await bobTx.wait();
  console.log(`requestJoin (bob) -> ${bobTx.hash}`);

  // 5. Alice accepts Bob and Bob's credential is claimed to a throwaway address.
  const acceptTx = await registry.connect(owner).acceptRequest(teamId, bobProof.nullifier);
  await acceptTx.wait();
  console.log(`acceptRequest (bob) -> ${acceptTx.hash}`);

  const claimTx = await registry
    .connect(owner)
    .claimCredential(teamId, bobProof.nullifier, bobClaimAddress, bobSalt);
  await claimTx.wait();
  console.log(`claimCredential (bob) -> ${claimTx.hash} (owner of NFT: ${bobClaimAddress})`);

  // 6. Charlie applies, is accepted, the team fills up and is revealed.
  const charliePresentation = "Charlie: zero-knowledge intern";
  const charlieSalt = BigInt("0x" + crypto.randomUUID().replace(/-/g, ""));
  const charlieClaimAddress = ethers.Wallet.createRandom().address;
  const charlieCommitment = claimCommitmentOf(charlieClaimAddress, charlieSalt);
  const charlieProof = await generateProof(
    charlie,
    group,
    joinMessageOf(charliePresentation, charlieCommitment),
    teamId
  );
  const charlieTx = await registry
    .connect(owner)
    .requestJoin(teamId, charliePresentation, charlieCommitment, charlieProof);
  await charlieTx.wait();
  const charlieAccept = await registry.connect(owner).acceptRequest(teamId, charlieProof.nullifier);
  await charlieAccept.wait();
  const revealTx = await registry.connect(owner).reveal(teamId);
  await revealTx.wait();
  console.log(`requestJoin+accept+reveal (charlie) -> ${charlieTx.hash}, ${charlieAccept.hash}, ${revealTx.hash}`);

  const tokenOwner = await credential.ownerOf(1);
  console.log(`\nTeam #${teamId} revealed. Credential #1 owner: ${tokenOwner}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

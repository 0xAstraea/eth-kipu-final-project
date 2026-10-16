import hre from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import {
  Protocol,
  ProtocolState,
  claimCommitmentOf,
  deployProtocolForDemo,
  makeCreateProofForDemo,
  makeJoinProofForDemo,
  saveState
} from "./lib/protocol";

const connection = await hre.network.create();
const { ethers } = connection;
const signers = await ethers.getSigners();

const step = (title: string) => {
  console.log(`\n${"=".repeat(64)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(64));
};

const short = (v: any) => `${v.toString().slice(0, 12)}...`;

async function main() {
  // ------------------------------------------------------------------
  step("MINUTE 1-2: Deploying the protocol (course owner acts as the professor)");
  // ------------------------------------------------------------------
  const protocol = await deployProtocolForDemo(signers, ethers);
  const { actors, registry, credential, identities, semaphore, groupId } = protocol;

  console.log("Semaphore core      :", await semaphore.getAddress());
  console.log("TeamRegistry        :", await registry.getAddress());
  console.log("TeamCredential (NFT):", await credential.getAddress());
  console.log("Course group id     :", groupId.toString());
  console.log("Enrolled students   :", (await semaphore.getMerkleTreeSize(groupId)).toString());
  console.log("  alice / bob / charlie have a Semaphore identity in the course group");

  const state: ProtocolState = {
    semaphore: await semaphore.getAddress(),
    credential: await credential.getAddress(),
    registry: await registry.getAddress(),
    groupId: groupId.toString(),
    identities: Object.fromEntries(
      Object.entries(identities).map(([name, identity]) => [name, identity.toString()])
    ),
    commitments: Object.fromEntries(
      Object.entries(identities).map(([name, identity]) => [name, identity.commitment.toString()])
    ),
    teamIds: []
  };

  // ------------------------------------------------------------------
  step("MINUTE 3: Alice creates a team (ZK proof of course membership)");
  // ------------------------------------------------------------------
  const { teamId, proof: createProof } = await makeCreateProofForDemo(protocol, identities.alice);
  await registry.connect(actors.alice).createTeam("Proyecto final", "Equipo de 3 - blockchain", 3, 0, createProof);
  state.teamId = teamId.toString();
  state.teamIds.push(teamId.toString());
  saveState(state);

  console.log(`Team #${teamId} created by`, actors.alice.address);
  console.log("Event TeamCreated -> the creator is a verified member (proof verified on-chain)");

  // ------------------------------------------------------------------
  step("MINUTE 4: Bob applies from a DISTINCT address (the sender is not stored)");
  // ------------------------------------------------------------------
  const presentation = "Se Solidity y Circom, 6h semanales";
  const claimAddress = actors.throwaway.address; // in real life: a throwaway address
  const claimCommitment = claimCommitmentOf(claimAddress, 42n);

  const joinProof = await makeJoinProofForDemo(protocol, identities.bob, teamId, presentation, claimCommitment);

  const joinTx = await registry
    .connect(actors.bob)
    .requestJoin(teamId, presentation, claimCommitment, joinProof);

  const receipt = await joinTx.wait();
  const joinEvent = receipt!.logs
    .map((log: any) => {
      try {
        return registry.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((event: any) => event && event.name === "JoinRequested");

  console.log("JoinRequested event:");
  console.log("  teamId   :", joinEvent!.args.teamId.toString());
  console.log("  nullifier:", short(joinEvent!.args.nullifier), "<- pseudonym, NOT the address");
  console.log("  sender   :", actors.bob.address, "<- never stored in the contract");

  // ------------------------------------------------------------------
  step("MINUTE 4b: Eve (not enrolled) tries to apply and fails");
  // ------------------------------------------------------------------
  try {
    const eveIdentity = new Identity("teamup-demo-eve");
    // A proof against a group that is not the course group is rejected on-chain.
    const eveProof = await generateProof(eveIdentity, new Group([...protocol.commitments, 999n]), 0n, teamId);
    await registry.connect(actors.eve).requestJoin(teamId, "let me in", claimCommitment, eveProof);
    console.log("SECURITY HOLE: eve was accepted!");
    process.exit(1);
  } catch {
    console.log("REVERTED on-chain -> only verified course members can apply (Semaphore proof)");
  }

  // ------------------------------------------------------------------
  step("MINUTE 5: Alice accepts Bob's nullifier");
  // ------------------------------------------------------------------
  await registry.connect(actors.alice).acceptRequest(teamId, joinProof.nullifier);
  console.log("JoinAccepted -> team members:", (await registry.getTeam(teamId)).membersCount.toString());

  // ------------------------------------------------------------------
  step("MINUTE 5b: Charlie joins and the team fills up");
  // ------------------------------------------------------------------
  const charlieClaim = claimCommitmentOf(actors.throwaway.address, 7n);
  const charliePresentation = "Frontend y documentacion";
  const charlieProof = await makeJoinProofForDemo(protocol, identities.charlie, teamId, charliePresentation, charlieClaim);
  await registry.connect(actors.charlie).requestJoin(teamId, charliePresentation, charlieClaim, charlieProof);
  await registry.connect(actors.alice).acceptRequest(teamId, charlieProof.nullifier);
  console.log("Team is now full:", (await registry.getTeam(teamId)).membersCount.toString(), "/ 3");

  // ------------------------------------------------------------------
  step("MINUTE 5c: with the team full, anyone reveals it (roster is committed)");
  // ------------------------------------------------------------------
  await registry.connect(actors.alice).reveal(teamId);
  const members = await registry.getTeamMembers(teamId);
  console.log("TeamRevealed -> nullifiers (never addresses):");
  for (const nullifier of members) {
    console.log("  -", short(nullifier));
  }
  console.log("rosterRoot (commitment over sorted nullifiers):", await registry.getTeamRosterRoot(teamId));

  // ------------------------------------------------------------------
  step("MINUTE 5d: Bob claims his credential (only possible after reveal)");
  // ------------------------------------------------------------------
  await registry
    .connect(actors.throwaway) // gas can be paid by anyone
    .claimCredential(teamId, joinProof.nullifier, claimAddress, 42n);

  console.log("CredentialClaimed -> NFT owner:", await credential.ownerOf(1n));
  console.log("  (the throwaway address chosen by Bob, NOT the application sender)");

  console.log("\nDEMO COMPLETE - see events in the logs and `npx hardhat test` (28 passing)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

import { expect } from "chai";
import hre from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import {
  Deployment,
  buildGroup,
  claimCommitmentOf,
  deployProtocol,
  makeCreateProof,
  makeJoinProof
} from "./helpers/setup";

const connection = await hre.network.create();
const { ethers, networkHelpers } = connection;

const PRESENTATION = "I know Solidity and Circom";
const SALT = 123456789n;

let d: Deployment;

before(async function () {
  this.timeout(120000);
  d = await deployProtocol();
});

after(async function () {
  // Closes the in-process network connection so the mocha runner can exit.
  // This must live in the LAST test file of the suite.
  await connection.close();
  // Hardhat 3 keeps handles open after tests; exit explicitly, preserving the
  // exit code mocha set (number of failures) once the summary is printed.
  setTimeout(() => process.exit(process.exitCode || 0), 1500).unref();
});

/// Creates a team as alice and returns its id and alice's nullifier.
async function createTeamAsAlice(maxMembers = 3, revealAtBlock: bigint = 0n) {
  const group = buildGroup(d.commitments);
  const teamId = await d.registry.nextTeamId();
  const proof = await makeCreateProof(d.identities.alice, group, teamId);

  await d.registry.connect(d.signers.alice).createTeam("TeamUp", "Final project", maxMembers, revealAtBlock, proof);

  return { teamId, nullifier: proof.nullifier };
}

/// Sends a join application as bob from any sender and returns the nullifier.
async function applyAsBob(teamId: bigint, claimCommitment: string, sender: any) {
  const group = buildGroup(d.commitments);
  const proof = await makeJoinProof(d.identities.bob, group, teamId, PRESENTATION, claimCommitment);

  await d.registry.connect(sender).requestJoin(teamId, PRESENTATION, claimCommitment, proof);

  return proof.nullifier;
}

/// Reveals a team through the deadline path (mines past revealAtBlock).
async function revealAfterDeadline(teamId: bigint) {
  await networkHelpers.mine(11);
  await d.registry.connect(d.signers.alice).reveal(teamId);
}

describe("TeamRegistry", function () {
  describe("course membership", function () {
    it("lets the course owner add members", async function () {
      const daveCommitment = d.identities.dave.commitment;

      await expect(d.registry.connect(d.signers.owner).addCourseMember(daveCommitment))
        .to.emit(d.registry, "CourseMemberAdded")
        .withArgs(d.groupId, daveCommitment);

      expect(await d.semaphore.hasMember(d.groupId, daveCommitment)).to.equal(true);
    });

    it("rejects members added by non-owners", async function () {
      await expect(
        d.registry.connect(d.signers.alice).addCourseMember(d.identities.dave.commitment)
      ).to.be.revertedWithCustomError(d.registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("createTeam", function () {
    it("creates a team for a verified member with a scoped ZK proof", async function () {
      const counterBefore = await d.registry.teamCounter();
      const { teamId } = await createTeamAsAlice();

      const team = await d.registry.getTeam(teamId);
      expect(team.admin).to.equal(d.signers.alice.address);
      expect(team.name).to.equal("TeamUp");
      expect(team.maxMembers).to.equal(3n);
      expect(team.membersCount).to.equal(1n); // creator is the first member
      expect(team.isRevealed).to.equal(false);

      expect(await d.registry.teamCounter()).to.equal(counterBefore + 1n);
    });

    it("rejects team creation from non-members", async function () {
      const teamId = await d.registry.nextTeamId();
      // A proof generated against a group that includes eve is useless on-chain:
      // its Merkle root is not part of the course group.
      const foreignGroup = buildGroup([...d.commitments, new Identity("eve").commitment]);
      const proof = await makeCreateProof(new Identity("eve"), foreignGroup, teamId);

      await expect(
        d.registry.connect(d.signers.eve).createTeam("TeamUp", "x", 3, 0, proof)
      ).to.be.revertedWithCustomError(d.semaphore, "Semaphore__MerkleTreeRootIsNotPartOfTheGroup");
    });

    it("rejects a proof scoped to a different team id", async function () {
      const proof = await makeCreateProof(d.identities.alice, buildGroup(d.commitments), 999n);

      await expect(
        d.registry.connect(d.signers.alice).createTeam("TeamUp", "x", 3, 0, proof)
      ).to.be.revertedWithCustomError(d.registry, "InvalidScope");
    });
  });

  describe("requestJoin", function () {
    it("accepts an application from a member and logs only the nullifier", async function () {
      const { teamId } = await createTeamAsAlice();

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const group = buildGroup(d.commitments);
      const proof = await makeJoinProof(d.identities.bob, group, teamId, PRESENTATION, claimCommitment);

      // Submitted from dave's signer: the event exposes the nullifier, not the sender.
      await expect(d.registry.connect(d.signers.dave).requestJoin(teamId, PRESENTATION, claimCommitment, proof))
        .to.emit(d.registry, "JoinRequested")
        .withArgs(teamId, proof.nullifier, PRESENTATION);

      const application = await d.registry.getApplication(teamId, proof.nullifier);
      expect(application.claimCommitment).to.equal(claimCommitment);
      expect(application.accepted).to.equal(false);
      expect(application.claimed).to.equal(false);
    });

    it("rejects applications from non-members", async function () {
      const { teamId } = await createTeamAsAlice();

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const foreignGroup = buildGroup([...d.commitments, new Identity("eve").commitment]);
      const proof = await makeJoinProof(new Identity("eve"), foreignGroup, teamId, PRESENTATION, claimCommitment);

      await expect(
        d.registry.connect(d.signers.eve).requestJoin(teamId, PRESENTATION, claimCommitment, proof)
      ).to.be.revertedWithCustomError(d.semaphore, "Semaphore__MerkleTreeRootIsNotPartOfTheGroup");
    });

    it("prevents double applications via the nullifier", async function () {
      const { teamId } = await createTeamAsAlice();

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      await applyAsBob(teamId, claimCommitment, d.signers.throwaway);

      // Same identity, same team scope: the nullifier was already burned. The
      // registry detects the duplicate before even calling Semaphore.
      await expect(
        applyAsBob(teamId, claimCommitment, d.signers.throwaway)
      ).to.be.revertedWithCustomError(d.registry, "ApplicationAlreadyExists");
    });

    it("blocks replay at both layers (registry first, Semaphore as backstop)", async function () {
      const { teamId } = await createTeamAsAlice();

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      await applyAsBob(teamId, claimCommitment, d.signers.throwaway);

      // Reusing the same identity + scope would burn the same nullifier twice.
      // The registry detects the duplicate first (ApplicationAlreadyExists) and
      // Semaphore's nullifier check is the second line of defence.
      await expect(
        applyAsBob(teamId, claimCommitment, d.signers.throwaway)
      ).to.be.revertedWithCustomError(d.registry, "ApplicationAlreadyExists");
    });

    it("rejects a tampered presentation (message hash mismatch)", async function () {
      const { teamId } = await createTeamAsAlice();

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const group = buildGroup(d.commitments);
      const proof = await makeJoinProof(d.identities.bob, group, teamId, PRESENTATION, claimCommitment);

      // The proof authenticates "I know Solidity and Circom"; swapping the text
      // changes the message hash and must fail.
      await expect(
        d.registry.connect(d.signers.bob).requestJoin(teamId, "I am an expert", claimCommitment, proof)
      ).to.be.revertedWithCustomError(d.registry, "InvalidMessageHash");
    });

    it("never binds the application to the sending address", async function () {
      const { teamId } = await createTeamAsAlice(2); // alice + bob fills the team

      // Bob's proof is submitted from charlie's signer: the tx sender is irrelevant.
      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const nullifier = await applyAsBob(teamId, claimCommitment, d.signers.charlie);

      // Alice (team admin) accepts a nullifier, not a person.
      await expect(d.registry.connect(d.signers.alice).acceptRequest(teamId, nullifier))
        .to.emit(d.registry, "JoinAccepted")
        .withArgs(teamId, nullifier);

      // The team is full, so it can be revealed and the credential claimed.
      await d.registry.connect(d.signers.alice).reveal(teamId);

      const tokenId = await d.credential.nextTokenId();

      // Bob claims to a throwaway address: neither charlie (the requestJoin sender)
      // nor any other address can intercept or be associated with the application.
      await expect(
        d.registry.connect(d.signers.throwaway).claimCredential(teamId, nullifier, d.signers.throwaway.address, SALT)
      )
        .to.emit(d.registry, "CredentialClaimed")
        .withArgs(teamId, nullifier, d.signers.throwaway.address);

      expect(await d.credential.ownerOf(tokenId)).to.equal(d.signers.throwaway.address);
      expect(await d.credential.teamOf(tokenId)).to.equal(teamId);
    });

    it("rejects applications to a full team", async function () {
      const { teamId } = await createTeamAsAlice(2); // alice + 1

      const bobClaim = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const bobNullifier = await applyAsBob(teamId, bobClaim, d.signers.bob);
      await d.registry.connect(d.signers.alice).acceptRequest(teamId, bobNullifier);

      // Team is full (alice + bob). Charlie's fresh application must be rejected.
      const charlieClaim = claimCommitmentOf(d.signers.throwaway.address, SALT + 2n);
      const charlieProof = await makeJoinProof(
        d.identities.charlie,
        buildGroup(d.commitments),
        teamId,
        PRESENTATION,
        charlieClaim
      );

      await expect(
        d.registry.connect(d.signers.charlie).requestJoin(teamId, PRESENTATION, charlieClaim, charlieProof)
      ).to.be.revertedWithCustomError(d.registry, "TeamIsFull");
    });
  });

  describe("acceptRequest", function () {
    it("rejects acceptances from non-admins", async function () {
      const { teamId } = await createTeamAsAlice();

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const nullifier = await applyAsBob(teamId, claimCommitment, d.signers.bob);

      await expect(
        d.registry.connect(d.signers.bob).acceptRequest(teamId, nullifier)
      ).to.be.revertedWithCustomError(d.registry, "NotTeamAdmin");
    });
  });

  describe("claimCredential", function () {
    it("rejects claims before the team is revealed", async function () {
      const { teamId } = await createTeamAsAlice(2, 0n); // alice + bob can fill it

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const nullifier = await applyAsBob(teamId, claimCommitment, d.signers.bob);
      await d.registry.connect(d.signers.alice).acceptRequest(teamId, nullifier);

      // Full but not revealed: the credential is not mintable yet.
      await expect(
        d.registry.connect(d.signers.bob).claimCredential(teamId, nullifier, d.signers.throwaway.address, SALT)
      ).to.be.revertedWithCustomError(d.registry, "TeamNotRevealed");
    });

    it("rejects claims before acceptance", async function () {
      const deadline = BigInt(await ethers.provider.getBlockNumber()) + 10n;
      const { teamId } = await createTeamAsAlice(3, deadline);

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const nullifier = await applyAsBob(teamId, claimCommitment, d.signers.bob);

      // Reveal through the deadline path while bob is still unaccepted.
      await revealAfterDeadline(teamId);

      await expect(
        d.registry.connect(d.signers.bob).claimCredential(teamId, nullifier, d.signers.bob.address, SALT)
      ).to.be.revertedWithCustomError(d.registry, "ApplicationNotAccepted");
    });

    it("rejects a claim with the wrong salt", async function () {
      const deadline = BigInt(await ethers.provider.getBlockNumber()) + 10n;
      const { teamId } = await createTeamAsAlice(3, deadline);

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const nullifier = await applyAsBob(teamId, claimCommitment, d.signers.bob);
      await d.registry.connect(d.signers.alice).acceptRequest(teamId, nullifier);
      await revealAfterDeadline(teamId);

      await expect(
        d.registry.connect(d.signers.bob).claimCredential(teamId, nullifier, d.signers.throwaway.address, SALT + 1n)
      ).to.be.revertedWithCustomError(d.registry, "InvalidClaimCommitment");
    });

    it("rejects a claim to an address not fixed in the commitment", async function () {
      const deadline = BigInt(await ethers.provider.getBlockNumber()) + 10n;
      const { teamId } = await createTeamAsAlice(3, deadline);

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const nullifier = await applyAsBob(teamId, claimCommitment, d.signers.bob);
      await d.registry.connect(d.signers.alice).acceptRequest(teamId, nullifier);
      await revealAfterDeadline(teamId);

      // Correct salt but different address: the commitment does not match.
      await expect(
        d.registry.connect(d.signers.bob).claimCredential(teamId, nullifier, d.signers.bob.address, SALT)
      ).to.be.revertedWithCustomError(d.registry, "InvalidClaimCommitment");
    });

    it("mints the credential once and rejects a second claim", async function () {
      const { teamId } = await createTeamAsAlice(2, 0n);

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const nullifier = await applyAsBob(teamId, claimCommitment, d.signers.bob);
      await d.registry.connect(d.signers.alice).acceptRequest(teamId, nullifier);
      await d.registry.connect(d.signers.alice).reveal(teamId);

      const tokenId = await d.credential.nextTokenId();

      await expect(
        d.registry.connect(d.signers.bob).claimCredential(teamId, nullifier, d.signers.throwaway.address, SALT)
      )
        .to.emit(d.registry, "CredentialClaimed")
        .withArgs(teamId, nullifier, d.signers.throwaway.address);

      expect(await d.credential.ownerOf(tokenId)).to.equal(d.signers.throwaway.address);

      await expect(
        d.registry.connect(d.signers.bob).claimCredential(teamId, nullifier, d.signers.throwaway.address, SALT)
      ).to.be.revertedWithCustomError(d.registry, "ApplicationAlreadyClaimed");
    });
  });

  describe("reveal", function () {
    it("rejects reveal before the team is full and before the deadline", async function () {
      const { teamId } = await createTeamAsAlice(3, 0n);

      await expect(d.registry.connect(d.signers.alice).reveal(teamId)).to.be.revertedWithCustomError(
        d.registry,
        "RevealConditionsNotMet"
      );
    });

    it("reveals the team when it is full", async function () {
      const { teamId, nullifier: aliceNullifier } = await createTeamAsAlice(2, 0n);

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const nullifier = await applyAsBob(teamId, claimCommitment, d.signers.bob);
      await d.registry.connect(d.signers.alice).acceptRequest(teamId, nullifier);

      const sorted = [BigInt(aliceNullifier), BigInt(nullifier)].sort((a, b) => (a < b ? -1 : 1));

      await expect(d.registry.connect(d.signers.alice).reveal(teamId))
        .to.emit(d.registry, "TeamRevealed")
        .withArgs(teamId, sorted);

      const team = await d.registry.getTeam(teamId);
      expect(team.isRevealed).to.equal(true);
    });

    it("stores a roster root over the sorted nullifiers", async function () {
      const { teamId, nullifier: aliceNullifier } = await createTeamAsAlice(2, 0n);

      expect(await d.registry.getTeamRosterRoot(teamId)).to.equal(ethers.ZeroHash);

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      const nullifier = await applyAsBob(teamId, claimCommitment, d.signers.bob);
      await d.registry.connect(d.signers.alice).acceptRequest(teamId, nullifier);
      await d.registry.connect(d.signers.alice).reveal(teamId);

      // Read the stored members (coerced to bigint) so the comparison is numeric,
      // then hash the ascending order the contract commits to.
      const members = (await d.registry.getTeamMembers(teamId)).map((x: bigint) => BigInt(x));
      const sorted = [...members].sort((a, b) => (a < b ? -1 : 1));
      const expected = ethers.keccak256(ethers.solidityPacked(["uint256[]"], [sorted]));

      expect(await d.registry.getTeamRosterRoot(teamId)).to.equal(expected);
    });

    it("reveals the team after the deadline", async function () {
      const deadline = BigInt(await ethers.provider.getBlockNumber()) + 10n;
      const { teamId } = await createTeamAsAlice(3, deadline);

      // Advance past the reveal block number (11 blocks to be safe).
      await networkHelpers.mine(11);

      await expect(d.registry.connect(d.signers.alice).reveal(teamId)).to.emit(
        d.registry,
        "TeamRevealed"
      );

      const team = await d.registry.getTeam(teamId);
      expect(team.isRevealed).to.equal(true);
    });

    it("rejects applications to an already revealed team", async function () {
      const deadline = BigInt(await ethers.provider.getBlockNumber()) + 10n;
      const { teamId } = await createTeamAsAlice(3, deadline);

      await networkHelpers.mine(11);
      await d.registry.connect(d.signers.alice).reveal(teamId);

      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
      await expect(
        applyAsBob(teamId, claimCommitment, d.signers.bob)
      ).to.be.revertedWithCustomError(d.registry, "TeamAlreadyRevealed");
    });
  });
});

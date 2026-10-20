import { expect } from "chai";
import {
  Deployment,
  buildGroup,
  claimCommitmentOf,
  deployProtocol,
  ethers,
  makeCreateProof,
  makeJoinProof
} from "./helpers/setup";

const SALT = 555000111n;
const PRESENTATION = "I know Solidity and Circom";

let d: Deployment;

/// A proof shape that never has to be valid, for the checks that run before the
/// Semaphore call.
const dummyProof = {
  merkleTreeDepth: 0n,
  merkleTreeRoot: 0n,
  nullifier: 0n,
  message: 0n,
  scope: 0n,
  points: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n] as const
};

before(async function () {
  this.timeout(120000);
  d = await deployProtocol();
});

/// Creates a team as alice and returns its id.
async function createTeamAsAlice(maxMembers = 3, revealAtBlock: bigint = 0n) {
  const group = buildGroup(d.commitments);
  const teamId = await d.registry.nextTeamId();
  const proof = await makeCreateProof(d.identities.alice, group, teamId);

  await d.registry.connect(d.signers.alice).createTeam("TeamUp", "Final project", maxMembers, revealAtBlock, proof);

  return teamId;
}

/// Applies as bob and returns his nullifier.
async function applyAsBob(teamId: bigint) {
  const group = buildGroup(d.commitments);
  const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);
  const proof = await makeJoinProof(d.identities.bob, group, teamId, PRESENTATION, claimCommitment);

  await d.registry.connect(d.signers.bob).requestJoin(teamId, PRESENTATION, claimCommitment, proof);

  return proof.nullifier;
}

describe("TeamRegistry guards", function () {
  describe("TeamCredential deployment", function () {
    it("rejects a zero registry address", async function () {
      await expect(
        ethers.deployContract("TeamCredential", [ethers.ZeroAddress])
      ).to.be.revertedWithCustomError(d.credential, "InvalidRegistry");
    });
  });

  describe("setCredential", function () {
    it("rejects a second wiring", async function () {
      await expect(
        d.registry.connect(d.signers.owner).setCredential(d.signers.eve.address)
      ).to.be.revertedWithCustomError(d.registry, "CredentialAlreadySet");
    });

    it("rejects the zero address", async function () {
      const registry: any = await ethers.deployContract("TeamRegistry", [await d.semaphore.getAddress()]);

      await expect(
        registry.connect(d.signers.owner).setCredential(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "CredentialNotSet");
    });
  });

  describe("requestJoin", function () {
    it("rejects an application to a team that does not exist", async function () {
      const claimCommitment = claimCommitmentOf(d.signers.throwaway.address, SALT);

      await expect(
        d.registry
          .connect(d.signers.bob)
          .requestJoin(9999n, PRESENTATION, claimCommitment, dummyProof)
      ).to.be.revertedWithCustomError(d.registry, "TeamDoesNotExist");
    });
  });

  describe("acceptRequest", function () {
    it("rejects a team that does not exist", async function () {
      await expect(
        d.registry.connect(d.signers.alice).acceptRequest(9999n, 1n)
      ).to.be.revertedWithCustomError(d.registry, "TeamDoesNotExist");
    });

    it("rejects a nullifier that never applied", async function () {
      const teamId = await createTeamAsAlice();

      await expect(
        d.registry.connect(d.signers.alice).acceptRequest(teamId, 12345n)
      ).to.be.revertedWithCustomError(d.registry, "ApplicationDoesNotExist");
    });

    it("rejects a second acceptance of the same nullifier", async function () {
      const teamId = await createTeamAsAlice(3);
      const nullifier = await applyAsBob(teamId);

      await d.registry.connect(d.signers.alice).acceptRequest(teamId, nullifier);

      await expect(
        d.registry.connect(d.signers.alice).acceptRequest(teamId, nullifier)
      ).to.be.revertedWithCustomError(d.registry, "ApplicationAlreadyExists");
    });

    it("rejects a team that is already full", async function () {
      const teamId = await createTeamAsAlice(1);

      await expect(
        d.registry.connect(d.signers.alice).acceptRequest(teamId, 1n)
      ).to.be.revertedWithCustomError(d.registry, "TeamIsFull");
    });

    it("rejects a team that is already revealed", async function () {
      const teamId = await createTeamAsAlice(1);
      await d.registry.connect(d.signers.alice).reveal(teamId);

      await expect(
        d.registry.connect(d.signers.alice).acceptRequest(teamId, 1n)
      ).to.be.revertedWithCustomError(d.registry, "TeamAlreadyRevealed");
    });
  });

  describe("claimCredential", function () {
    it("rejects a claim before the credential contract is wired", async function () {
      const registry: any = await ethers.deployContract("TeamRegistry", [await d.semaphore.getAddress()]);

      await expect(
        registry.connect(d.signers.alice).claimCredential(0n, 1n, d.signers.alice.address, SALT)
      ).to.be.revertedWithCustomError(registry, "CredentialNotSet");
    });

    it("rejects a claim on a team that does not exist", async function () {
      await expect(
        d.registry
          .connect(d.signers.alice)
          .claimCredential(9999n, 1n, d.signers.alice.address, SALT)
      ).to.be.revertedWithCustomError(d.registry, "TeamDoesNotExist");
    });

    it("rejects a claim for a nullifier that never applied", async function () {
      const teamId = await createTeamAsAlice(1);
      await d.registry.connect(d.signers.alice).reveal(teamId);

      await expect(
        d.registry
          .connect(d.signers.alice)
          .claimCredential(teamId, 12345n, d.signers.alice.address, SALT)
      ).to.be.revertedWithCustomError(d.registry, "ApplicationDoesNotExist");
    });
  });

  describe("reveal", function () {
    it("rejects a team that does not exist", async function () {
      await expect(d.registry.connect(d.signers.alice).reveal(9999n)).to.be.revertedWithCustomError(
        d.registry,
        "TeamDoesNotExist"
      );
    });

    it("rejects a second reveal of the same team", async function () {
      const teamId = await createTeamAsAlice(1);

      await d.registry.connect(d.signers.alice).reveal(teamId);

      await expect(d.registry.connect(d.signers.alice).reveal(teamId)).to.be.revertedWithCustomError(
        d.registry,
        "TeamAlreadyRevealed"
      );
    });
  });
});

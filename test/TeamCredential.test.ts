import { expect } from "chai";
import hre from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import {
  buildGroup,
  claimCommitmentOf,
  deployProtocol,
  makeCreateProof,
  makeJoinProof
} from "./helpers/setup";

const connection = await hre.network.create();
const { ethers } = connection;

const SALT = 987654321n;

let d: Awaited<ReturnType<typeof deployProtocol>>;

before(async function () {
  this.timeout(120000);
  d = await deployProtocol();
});

describe("TeamCredential", function () {
  it("binds the registry at construction and refuses everyone else", async function () {
    expect(await d.credential.registry()).to.equal(await d.registry.getAddress());

    await expect(d.credential.connect(d.signers.alice).mint(d.signers.alice.address, 0)).to.be.revertedWithCustomError(
      d.credential,
      "NotRegistry"
    );
  });

  it("mints a credential with on-chain metadata through the team flow", async function () {
    // Full flow: create team -> apply -> accept -> claim
    const group = buildGroup(d.commitments);
    const teamId = await d.registry.nextTeamId();
    const proof = await makeCreateProof(d.identities.alice, group, teamId);
    await d.registry.connect(d.signers.alice).createTeam("Credential test", "full flow", 2, 0, proof);

    const claimAddress = d.signers.throwaway.address;
    const claimCommitment = claimCommitmentOf(claimAddress, SALT);
    const joinProof = await makeJoinProof(d.identities.bob, group, teamId, "hello", claimCommitment);
    await d.registry.connect(d.signers.bob).requestJoin(teamId, "hello", claimCommitment, joinProof);
    await d.registry.connect(d.signers.alice).acceptRequest(teamId, joinProof.nullifier);
    await d.registry.connect(d.signers.alice).reveal(teamId);

    await d.registry.connect(d.signers.throwaway).claimCredential(teamId, joinProof.nullifier, claimAddress, SALT);

    const tokenId = 1n;
    expect(await d.credential.ownerOf(tokenId)).to.equal(claimAddress);
    expect(await d.credential.teamOf(tokenId)).to.equal(teamId);
    expect(await d.credential.balanceOf(claimAddress)).to.equal(1n);

    const tokenUri = await d.credential.tokenURI(tokenId);
    expect(tokenUri.startsWith("data:application/json;base64,")).to.equal(true);

    const metadata = JSON.parse(
      Buffer.from(tokenUri.replace("data:application/json;base64,", ""), "base64").toString("utf8")
    );
    expect(metadata.name).to.equal("TeamUp Credential #1");
    expect(metadata.attributes[0].trait_type).to.equal("Team");
    expect(metadata.attributes[0].value).to.equal(teamId.toString());
  });

  it("tracks the next token id", async function () {
    expect(await d.credential.nextTokenId()).to.equal(2n);
  });
});

// NOTE: the network connection is closed and the process force-exited in
// TeamRegistry.test.ts (the last test file), so the full `hardhat test` run
// terminates cleanly.

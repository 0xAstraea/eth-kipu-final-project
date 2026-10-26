import hre from "hardhat";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { claimCommitmentOf, joinMessageOf } from "../scripts/lib/protocol";

const connection = await hre.network.create();
const { ethers } = connection;

const LOG_PAGE_SIZE = 9_000n;

/// Load identity commitments from CourseMemberAdded, paging to satisfy RPC limits.
async function loadCourseCommitments(
  registry: any,
  courseGroupId: string | number | bigint,
  provider: { getBlockNumber: () => Promise<number> }
): Promise<bigint[]> {
  const latest = BigInt(await provider.getBlockNumber());
  // This registry was deployed recently; scanning the full chain hits RPC range caps
  // and is slow. 200k blocks is enough for Sepolia evidence runs.
  const lookback = 200_000n;
  let from = latest > lookback ? latest - lookback : 0n;
  const commitments: bigint[] = [];
  const filter = registry.filters.CourseMemberAdded(courseGroupId);

  for (; from <= latest; from += LOG_PAGE_SIZE) {
    const to = from + LOG_PAGE_SIZE - 1n > latest ? latest : from + LOG_PAGE_SIZE - 1n;
    const logs = await registry.queryFilter(filter, from, to);
    for (const log of logs) {
      commitments.push(log.args.identityCommitment as bigint);
    }
  }
  return commitments;
}

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

  // Rebuild the off-chain Merkle group from on-chain enrollments (works on a
  // non-empty course group), then append three fresh identities for this run.
  // Paginate: public RPCs often cap eth_getLogs to ~10k blocks.
  const existingCommitments = await loadCourseCommitments(
    registry,
    state.courseGroupId,
    ethers.provider
  );
  console.log(`Course group ${state.courseGroupId} already has ${existingCommitments.length} member(s)`);

  // 1. Fresh identities (never hardcoded).
  const alice = new Identity();
  const bob = new Identity();
  const charlie = new Identity();

  // 2. The course owner enrolls them, in one transaction.
  const enrollTx = await registry
    .connect(owner)
    .addCourseMembers([alice.commitment, bob.commitment, charlie.commitment]);
  await enrollTx.wait();
  console.log(`addCourseMembers (alice, bob, charlie) -> ${enrollTx.hash}`);

  const commitments = [...existingCommitments, alice.commitment, bob.commitment, charlie.commitment];
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

  // 5. Alice accepts Bob.
  const acceptTx = await registry.connect(owner).acceptRequest(teamId, bobProof.nullifier);
  await acceptTx.wait();
  console.log(`acceptRequest (bob) -> ${acceptTx.hash}`);

  // 6. Charlie applies and is accepted; the team now fills up (alice + bob + charlie).
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
  console.log(`requestJoin+accept (charlie) -> ${charlieTx.hash}, ${charlieAccept.hash}`);

  // 7. With the team full, anyone reveals it: the roster is frozen and committed.
  const revealTx = await registry.connect(owner).reveal(teamId);
  await revealTx.wait();
  console.log(`reveal #${teamId} -> ${revealTx.hash} (rosterRoot: ${await registry.getTeamRosterRoot(teamId)})`);

  // 8. Credentials can only be claimed once the team is revealed.
  const claimTx = await registry
    .connect(owner)
    .claimCredential(teamId, bobProof.nullifier, bobClaimAddress, bobSalt);
  await claimTx.wait();
  console.log(`claimCredential (bob) -> ${claimTx.hash} (owner of NFT: ${bobClaimAddress})`);

  const charlieClaim = await registry
    .connect(owner)
    .claimCredential(teamId, charlieProof.nullifier, charlieClaimAddress, charlieSalt);
  await charlieClaim.wait();
  console.log(`claimCredential (charlie) -> ${charlieClaim.hash} (owner of NFT: ${charlieClaimAddress})`);

  const bobTokenId = await credential.nextTokenId().then((n: bigint) => n - 2n).catch(() => 0n);
  // Prefer reading ownership of the addresses we just minted to.
  console.log(`\nTeam #${teamId} revealed.`);
  console.log(`Bob NFT held by ${bobClaimAddress}; Charlie NFT held by ${charlieClaimAddress}`);
  void bobTokenId;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// Gas profiler for the TeamUp protocol. Re-runnable, deterministic, caches proofs on disk.
// Every measurement lands in the single committed file gas-snapshot.json, under the name
// given by GAS_REPORT_NAME.
//
// Usage: npx hardhat run scripts/gas-profile.ts
import hre from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { AbiCoder, keccak256, solidityPackedKeccak256 } from "ethers";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { POSEIDON_LINK_KEY } from "./lib/protocol";

const { ethers } = await hre.network.create();

const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const CACHE_DIR = join(process.cwd(), ".gas-cache");
const SNAPSHOT = join(process.cwd(), "gas-snapshot.json");
const NAME = process.env.GAS_REPORT_NAME ?? "applied";

const rows: { label: string; gas: number }[] = [];

function record(label: string, gas: bigint | number) {
  rows.push({ label, gas: Number(gas) });
  console.log(label.padEnd(48), Number(gas).toLocaleString("en-US"));
}

async function measure(label: string, txPromise: Promise<any>) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  record(label, receipt.gasUsed);
  return receipt;
}

function artifactSize(name: string): number {
  const artifact = JSON.parse(
    readFileSync(join(process.cwd(), "artifacts", "contracts", `${name}.sol`, `${name}.json`), "utf8")
  );
  return (artifact.deployedBytecode.length - 2) / 2;
}

function claimCommitmentOf(claimAddress: string, salt: bigint): string {
  return keccak256(AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [claimAddress, salt]));
}

function joinMessageOf(presentation: string, claimCommitment: string): bigint {
  return BigInt(solidityPackedKeccak256(["string", "bytes32"], [presentation, claimCommitment])) %
    SNARK_FIELD_SIZE;
}

/// Proofs are deterministic for a fixed identity + group + message + scope, so they are
/// cached on disk. Each run deploys a fresh Semaphore, so a cached nullifier is never burned.
async function cachedProof(key: string, build: () => Promise<any>) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const proof = await build();
  writeFileSync(file, JSON.stringify(proof, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  return proof;
}

const [owner, alice, bob, charlie] = await ethers.getSigners();

console.log("\n=== deployments ===");
const verifier = (await ethers.deployContract("SemaphoreVerifier"))!;
const verifierAddress = (await verifier.getAddress())!;
record("deploy SemaphoreVerifier", (await verifier.deploymentTransaction()!.wait())!.gasUsed);
const poseidon = (await ethers.deployContract("PoseidonT3"))!;
const poseidonAddress = (await poseidon.getAddress())!;
record("deploy PoseidonT3", (await poseidon.deploymentTransaction()!.wait())!.gasUsed);

const semaphoreFactory = await ethers.getContractFactory("Semaphore", {
  libraries: { [POSEIDON_LINK_KEY]: poseidonAddress }
});
const semaphore: any = await semaphoreFactory.deploy(verifierAddress);
record("deploy Semaphore", (await semaphore.deploymentTransaction()!.wait())!.gasUsed);

const credentialFactory = await ethers.getContractFactory("TeamCredential");
const credentialCtorArgs = credentialFactory.interface.deploy.inputs.length;

console.log("\n=== deployments (protocol) ===");
let credential: any;
let registry: any;
if (credentialCtorArgs === 1) {
  registry = await ethers.deployContract("TeamRegistry", [await semaphore.getAddress()]);
  record("deploy TeamRegistry", (await registry.deploymentTransaction()!.wait())!.gasUsed);
  credential = await ethers.deployContract("TeamCredential", [await registry.getAddress()]);
  record("deploy TeamCredential", (await credential.deploymentTransaction()!.wait())!.gasUsed);
} else {
  credential = await ethers.deployContract("TeamCredential");
  record("deploy TeamCredential", (await credential.deploymentTransaction()!.wait())!.gasUsed);
  registry = await ethers.deployContract("TeamRegistry", [await semaphore.getAddress()]);
  record("deploy TeamRegistry", (await registry.deploymentTransaction()!.wait())!.gasUsed);
}

console.log("\n=== setup ===");
if (credentialCtorArgs === 1) {
  record(
    "TeamRegistry.setCredential",
    (await (await registry.connect(owner).setCredential(await credential.getAddress())).wait()).gasUsed
  );
} else {
  await measure("TeamCredential.setRegistry", credential.setRegistry(await registry.getAddress()));
  await measure("TeamRegistry.setCredential", registry.connect(owner).setCredential(await credential.getAddress()));
}

const identities = {
  alice: new Identity("gas-alice"),
  bob: new Identity("gas-bob"),
  charlie: new Identity("gas-charlie")
};
const commitments = [identities.alice.commitment, identities.bob.commitment, identities.charlie.commitment];

await measure(
  "TeamRegistry.addCourseMembers (3 students)",
  registry.connect(owner).addCourseMembers(commitments)
);

const groupId: bigint = await registry.courseGroupId();
const group = new Group(commitments);

console.log("\n=== protocol flow ===");
const teamId = await registry.nextTeamId();
const createProof = await cachedProof("create-0", () => generateProof(identities.alice, group, 0n, teamId));
await measure(
  "TeamRegistry.createTeam",
  registry.connect(alice).createTeam(
    "Gas team",
    "Team used to measure gas costs of the team formation flow",
    2,
    0,
    createProof
  )
);

const presentation = "I can do the frontend and the contracts";
const claimCommitment = claimCommitmentOf(alice.address, 12345n);
const joinProof = await cachedProof("join-0", () =>
  generateProof(identities.bob, group, joinMessageOf(presentation, claimCommitment), teamId)
);
await measure(
  "TeamRegistry.requestJoin",
  registry.connect(bob).requestJoin(teamId, presentation, claimCommitment, joinProof)
);
await measure("TeamRegistry.acceptRequest", registry.connect(alice).acceptRequest(teamId, joinProof.nullifier));
await measure("TeamRegistry.reveal", registry.connect(alice).reveal(teamId));
await measure(
  "TeamRegistry.claimCredential",
  registry.connect(bob).claimCredential(teamId, joinProof.nullifier, alice.address, 12345n)
);

console.log("\n=== attribution: bare proof verification ===");
const proof2 = await cachedProof("bare-999", () => generateProof(identities.charlie, group, 0n, 999n));
await measure("Semaphore.validateProof (bare, no registry logic)", semaphore.validateProof(groupId, proof2));

console.log("\n=== attribution: storage of team strings ===");
const emptyProof = await cachedProof("create-1", () => generateProof(identities.alice, group, 0n, 1n));
await measure(
  "TeamRegistry.createTeam (empty strings)",
  registry.connect(alice).createTeam("", "", 2, 0, emptyProof)
);

console.log("\n=== scenario: deadline reveal (revealAtBlock != 0) ===");
const currentBlock = await ethers.provider.getBlockNumber();
const deadlineProof = await cachedProof("create-2", () => generateProof(identities.alice, group, 0n, 2n));
await measure(
  "TeamRegistry.createTeam (revealAtBlock set)",
  registry.connect(alice).createTeam(
    "Deadline team",
    "Team revealed by the deadline instead of by being full",
    5,
    currentBlock,
    deadlineProof
  )
);
await measure("TeamRegistry.reveal (by deadline)", registry.connect(alice).reveal(2n));

console.log("\n=== scenario: long description ===");
const longProof = await cachedProof("create-3", () => generateProof(identities.alice, group, 0n, 3n));
await measure(
  "TeamRegistry.createTeam (200-char description)",
  registry.connect(alice).createTeam("Long team", "x".repeat(200), 5, 0, longProof)
);

console.log("\n=== attribution: ERC721 mint in isolation ===");
const scratchCredential: any = await ethers.deployContract(
  "TeamCredential",
  credentialCtorArgs === 1 ? [owner.address] : []
);
if (credentialCtorArgs === 0) {
  await scratchCredential.setRegistry(owner.address);
}
await measure("TeamCredential.mint (direct, isolated)", scratchCredential.mint(alice.address, 0n));

console.log("\n=== scenario: batch vs individual enrollment ===");
const rawSemaphore: any = await semaphoreFactory.deploy(verifierAddress);
await (await rawSemaphore["createGroup(address)"](owner.address)).wait();
const rawGroupId: bigint = (await rawSemaphore.groupCounter()) - 1n;
const batchIdentities = [new Identity("enroll-1"), new Identity("enroll-2"), new Identity("enroll-3")];
const batchCommitments = batchIdentities.map((identity) => identity.commitment);

let individualTotal = 0n;
for (const commitment of batchCommitments) {
  const receipt = await (await rawSemaphore.addMember(rawGroupId, commitment)).wait();
  individualTotal += receipt.gasUsed;
}
record("Semaphore.addMember x3 (individual total)", individualTotal);

await (await rawSemaphore["createGroup(address)"](owner.address)).wait();
const batchGroupId: bigint = (await rawSemaphore.groupCounter()) - 1n;
const batchReceipt = await (await rawSemaphore.addMembers(batchGroupId, batchCommitments)).wait();
record("Semaphore.addMembers (3 in one tx)", batchReceipt.gasUsed);

console.log("\n=== scenario: one Semaphore behind many registries ===");
const shared: any = await semaphoreFactory.deploy(verifierAddress);
const registryA: any = await ethers.deployContract("TeamRegistry", [await shared.getAddress()]);
const registryB: any = await ethers.deployContract("TeamRegistry", [await shared.getAddress()]);
console.log("registry A group:", (await registryA.courseGroupId()).toString());
console.log("registry B group:", (await registryB.courseGroupId()).toString());
await (await registryA.connect(owner).addCourseMember(identities.alice.commitment)).wait();
await (await registryB.connect(owner).addCourseMember(identities.alice.commitment)).wait();
console.log(
  "both groups hold the member:",
  (await shared.hasMember(await registryA.courseGroupId(), identities.alice.commitment)) &&
    (await shared.hasMember(await registryB.courseGroupId(), identities.alice.commitment))
);

console.log("\n=== views (eth_estimateGas) ===");
async function estimate(label: string, fn: () => Promise<any>) {
  try {
    record(label, await fn());
  } catch (e: any) {
    console.log(label.padEnd(48), "n/a", e.shortMessage ?? e.message);
  }
}
await estimate("TeamCredential.tokenURI (view)", () => credential.tokenURI.estimateGas(1n) as any);
await estimate("TeamRegistry.getTeam (view)", () => registry.getTeam.estimateGas(0n) as any);
await estimate("TeamRegistry.getTeamMembers (view)", () => registry.getTeamMembers.estimateGas(0n) as any);
await estimate("TeamRegistry.getApplication (view)", () => registry.getApplication.estimateGas(0n, 1n) as any);

console.log("\n=== summary ===");
const flow = [
  "TeamRegistry.createTeam",
  "TeamRegistry.requestJoin",
  "TeamRegistry.acceptRequest",
  "TeamRegistry.reveal",
  "TeamRegistry.claimCredential"
];
const flowTotal = rows.filter((r) => flow.includes(r.label)).reduce((a, r) => a + r.gas, 0);
console.log("flow total:", flowTotal.toLocaleString("en-US"));
const deployTotal = rows.filter((r) => r.label.startsWith("deploy")).reduce((a, r) => a + r.gas, 0);
console.log("deploy total:", deployTotal.toLocaleString("en-US"));

const sizes = {
  TeamRegistry: artifactSize("TeamRegistry"),
  TeamCredential: artifactSize("TeamCredential")
};
console.log("deployed bytecode sizes:", JSON.stringify(sizes));

const snapshot = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : {};
snapshot[NAME] = {
  measuredAt: new Date().toISOString(),
  rows,
  flowTotal,
  deployTotal,
  sizes
};
writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2));
console.log(`snapshot written to ${SNAPSHOT} (entry "${NAME}")`);

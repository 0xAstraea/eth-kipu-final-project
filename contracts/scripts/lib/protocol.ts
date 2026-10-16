import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AbiCoder, keccak256, solidityPackedKeccak256 } from "ethers";

export const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const POSEIDON_LINK_KEY = "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3";

export const STATE_PATH = join(process.cwd(), "deployments", "localhost.json");

export interface ProtocolState {
  semaphore: string;
  credential: string;
  registry: string;
  groupId: string;
  identities: Record<string, string>; // name -> identity JSON string
  commitments: Record<string, string>;
  teamId?: string;
  teamIds: string[];
}

export function claimCommitmentOf(claimAddress: string, salt: bigint): string {
  return keccak256(AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [claimAddress, salt]));
}

export function joinMessageOf(presentation: string, claimCommitment: string): bigint {
  return BigInt(solidityPackedKeccak256(["string", "bytes32"], [presentation, claimCommitment])) % SNARK_FIELD_SIZE;
}

export function loadState(): ProtocolState | null {
  if (!existsSync(STATE_PATH)) return null;
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

export function saveState(state: ProtocolState): void {
  mkdirSync(join(STATE_PATH, ".."), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export interface Actors {
  owner: any; // the course owner (e.g. the professor)
  alice: any;
  bob: any;
  charlie: any;
  eve: any; // NOT a course member
  throwaway: any; // used to show senders are irrelevant / destinations are free
}

export interface Protocol {
  actors: Actors;
  semaphore: any;
  credential: any;
  registry: any;
  identities: Record<"alice" | "bob" | "charlie", Identity>;
  commitments: bigint[];
  groupId: bigint;
}

/// Deploys the whole protocol and enrolls alice, bob and charlie as course members.
/// @param ethers The HardhatEthers instance from the caller's network connection.
export async function deployProtocolForDemo(signers: any[], ethers: any): Promise<Protocol> {
  const [owner, alice, bob, charlie, eve, throwaway] = signers;

  const verifier = await ethers.deployContract("SemaphoreVerifier");
  const poseidonT3 = await ethers.deployContract("PoseidonT3");
  const semaphoreFactory = await ethers.getContractFactory("Semaphore", {
    libraries: { [POSEIDON_LINK_KEY]: await poseidonT3.getAddress() }
  });
  const semaphore = await semaphoreFactory.deploy(await verifier.getAddress());
  const credential = await ethers.deployContract("TeamCredential");
  const registry = await ethers.deployContract("TeamRegistry", [await semaphore.getAddress()]);
  await credential.setRegistry(await registry.getAddress());
  await registry.connect(owner).setCredential(await credential.getAddress());

  const identities = {
    alice: new Identity("teamup-demo-alice"),
    bob: new Identity("teamup-demo-bob"),
    charlie: new Identity("teamup-demo-charlie")
  };

  const commitments: bigint[] = [];
  for (const name of ["alice", "bob", "charlie"] as const) {
    const commitment = identities[name].commitment;
    await registry.connect(owner).addCourseMember(commitment);
    commitments.push(commitment);
  }

  const groupId: bigint = await registry.courseGroupId();

  return {
    actors: { owner, alice, bob, charlie, eve, throwaway },
    semaphore,
    credential,
    registry,
    identities,
    commitments,
    groupId
  };
}

/// Generates a scoped proof for creating a team (scope = the next team id).
export async function makeCreateProofForDemo(protocol: Protocol, creator: Identity) {
  const teamId = await protocol.registry.nextTeamId();
  const group = new Group(protocol.commitments);
  const proof = await generateProof(creator, group, 0n, teamId);
  return { teamId, proof };
}

/// Generates a scoped proof for applying to a team (scope = teamId) with the
/// authenticated presentation + claim commitment as the message.
export async function makeJoinProofForDemo(
  protocol: Protocol,
  applicant: Identity,
  teamId: bigint,
  presentation: string,
  claimCommitment: string
) {
  const group = new Group(protocol.commitments);
  const message = joinMessageOf(presentation, claimCommitment);
  const proof = await generateProof(applicant, group, message, teamId);
  return proof;
}

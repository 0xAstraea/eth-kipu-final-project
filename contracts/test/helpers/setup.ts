import hre from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { AbiCoder, keccak256, solidityPackedKeccak256 } from "ethers";

const { ethers } = await hre.network.create();

/// BN254 scalar field. Must match TeamRegistry.SNARK_FIELD_SIZE.
export const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/// The library link key used when deploying Semaphore with hardhat-ethers.
export const POSEIDON_LINK_KEY = "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3";

export interface Deployment {
  signers: {
    owner: any;
    alice: any;
    bob: any;
    charlie: any;
    dave: any;
    eve: any;
    throwaway: any;
  };
  semaphore: any;
  credential: any;
  registry: any;
  groupId: bigint;
  identities: Record<"alice" | "bob" | "charlie" | "dave", Identity>;
  commitments: bigint[];
}

/// Deploys the full protocol and enrolls alice, bob and charlie as course members.
/// "eve" is intentionally left out so tests can prove non-members are rejected.
export async function deployProtocol(): Promise<Deployment> {
  const [owner, alice, bob, charlie, dave, eve, throwaway] = await ethers.getSigners();

  const verifier = await ethers.deployContract("SemaphoreVerifier");
  const poseidonT3 = await ethers.deployContract("PoseidonT3");

  const semaphoreFactory = await ethers.getContractFactory("Semaphore", {
    libraries: { [POSEIDON_LINK_KEY]: await poseidonT3.getAddress() }
  });
  const semaphore: any = await semaphoreFactory.deploy(await verifier.getAddress());

  const credential: any = await ethers.deployContract("TeamCredential");
  const registry: any = await ethers.deployContract("TeamRegistry", [await semaphore.getAddress()]);
  await credential.setRegistry(await registry.getAddress());
  await registry.connect(owner).setCredential(await credential.getAddress());

  const groupId: bigint = await registry.courseGroupId();

  const identities = {
    alice: new Identity("alice"),
    bob: new Identity("bob"),
    charlie: new Identity("charlie"),
    dave: new Identity("dave")
  };

  const commitments: bigint[] = [];
  for (const name of ["alice", "bob", "charlie"] as const) {
    const commitment = identities[name].commitment;
    await registry.connect(owner).addCourseMember(commitment);
    commitments.push(commitment);
  }

  return {
    signers: { owner, alice, bob, charlie, dave, eve, throwaway },
    semaphore,
    credential,
    registry,
    groupId,
    identities,
    commitments
  };
}

/// Rebuilds an off-chain Semaphore group from a list of commitments.
export function buildGroup(commitments: bigint[]): Group {
  return new Group(commitments);
}

/// Computes the claim commitment the contract expects:
/// keccak256(abi.encode(claimAddress, salt)).
export function claimCommitmentOf(claimAddress: string, salt: bigint): string {
  return keccak256(AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [claimAddress, salt]));
}

/// Computes the authenticated join message:
/// keccak256(presentation, claimCommitment) reduced to the SNARK field.
export function joinMessageOf(presentation: string, claimCommitment: string): bigint {
  const hash = solidityPackedKeccak256(["string", "bytes32"], [presentation, claimCommitment]);
  return BigInt(hash) % SNARK_FIELD_SIZE;
}

/// Generates a Semaphore proof for joining a team (scope = teamId).
export function makeJoinProof(
  identity: Identity,
  group: Group,
  teamId: bigint,
  presentation: string,
  claimCommitment: string
) {
  return generateProof(identity, group, joinMessageOf(presentation, claimCommitment), teamId);
}

/// Generates a Semaphore proof for creating a team (scope = the next team id).
export function makeCreateProof(identity: Identity, group: Group, teamId: bigint) {
  return generateProof(identity, group, 0n, teamId);
}

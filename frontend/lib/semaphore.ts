import { concat, encodeAbiParameters, keccak256, toBytes, type Address } from "viem";

/** BN254 scalar field size; Semaphore messages must be reduced modulo this value. */
export const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type Groth16Points = readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

export type ContractProof = {
  merkleTreeDepth: bigint;
  merkleTreeRoot: bigint;
  nullifier: bigint;
  message: bigint;
  scope: bigint;
  points: Groth16Points;
};

/** keccak256(abi.encode(claimAddress, salt)) — must match TeamRegistry.claimCredential. */
export function claimCommitmentOf(claimAddress: Address, salt: bigint): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [claimAddress, salt]));
}

/** keccak256(abi.encodePacked(presentation, claimCommitment)) % SNARK_FIELD_SIZE. */
export function joinMessageOf(presentation: string, claimCommitment: `0x${string}`): bigint {
  return BigInt(keccak256(concat([toBytes(presentation), claimCommitment]))) % SNARK_FIELD_SIZE;
}

function toContractProof(proof: {
  merkleTreeDepth: number | bigint;
  merkleTreeRoot: string | bigint;
  nullifier: string | bigint;
  message: string | bigint;
  scope: string | bigint;
  points: readonly (string | bigint)[];
}): ContractProof {
  return {
    merkleTreeDepth: BigInt(proof.merkleTreeDepth),
    merkleTreeRoot: BigInt(proof.merkleTreeRoot),
    nullifier: BigInt(proof.nullifier),
    message: BigInt(proof.message),
    scope: BigInt(proof.scope),
    points: proof.points.map((p) => BigInt(p)) as unknown as Groth16Points
  };
}

/** Builds a proof for createTeam. Scope is the team id that will be assigned (nextTeamId). */
export async function createTeamProof(
  privateKey: string,
  commitments: bigint[],
  teamId: bigint
): Promise<ContractProof> {
  const [{ Identity }, { Group }, { generateProof }] = await Promise.all([
    import("@semaphore-protocol/identity"),
    import("@semaphore-protocol/group"),
    import("@semaphore-protocol/proof")
  ]);
  const identity = Identity.import(privateKey);
  const group = new Group(commitments);
  const proof = await generateProof(identity, group, 0n, teamId);
  return toContractProof(proof);
}

/** Builds a proof for requestJoin. Scope is the team id; the message authenticates
 * the presentation and the claim commitment. */
export async function joinProof(
  privateKey: string,
  commitments: bigint[],
  teamId: bigint,
  presentation: string,
  claimCommitment: `0x${string}`
): Promise<ContractProof> {
  const [{ Identity }, { Group }, { generateProof }] = await Promise.all([
    import("@semaphore-protocol/identity"),
    import("@semaphore-protocol/group"),
    import("@semaphore-protocol/proof")
  ]);
  const identity = Identity.import(privateKey);
  const group = new Group(commitments);
  const message = joinMessageOf(presentation, claimCommitment);
  const proof = await generateProof(identity, group, message, teamId);
  return toContractProof(proof);
}

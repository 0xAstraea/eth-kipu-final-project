import { parseAbiItem } from "viem";
import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses, publicClient } from "@/lib/config";

export type Team = {
  id: bigint;
  admin: `0x${string}`;
  name: string;
  description: string;
  maxMembers: bigint;
  revealAtBlock: bigint;
  isRevealed: boolean;
  rosterRoot: `0x${string}`;
  members: bigint[];
};

const courseMemberAdded = parseAbiItem(
  "event CourseMemberAdded(uint256 indexed groupId, uint256 identityCommitment)"
);

const fromBlock = BigInt(process.env.NEXT_PUBLIC_FROM_BLOCK ?? "0");

/** Reads the course member commitments from the registry's CourseMemberAdded logs,
 * in insertion order. Semaphore exposes no on-chain member enumeration, so the
 * off-chain group must be rebuilt from events. */
export async function getCourseCommitments(): Promise<bigint[]> {
  try {
    const logs = await publicClient().getLogs({
      address: addresses.registry,
      event: courseMemberAdded,
      fromBlock,
      toBlock: "latest"
    });
    return logs.map((log) => log.args.identityCommitment as bigint);
  } catch {
    return [];
  }
}

export async function getTeams(): Promise<Team[]> {
  const client = publicClient();
  try {
    const count = (await client.readContract({
      address: addresses.registry,
      abi: teamRegistryAbi,
      functionName: "nextTeamId"
    })) as bigint;

    const teams: Team[] = [];
    for (let id = 0n; id < count; id++) {
      const [admin, name, description, maxMembers, revealAtBlock, isRevealed] = (await client.readContract({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "getTeam",
        args: [id]
      })) as [string, string, string, bigint, bigint, boolean, bigint];

      const members = (await client.readContract({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "getTeamMembers",
        args: [id]
      })) as bigint[];

      const rosterRoot = (await client.readContract({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "getTeamRosterRoot",
        args: [id]
      })) as `0x${string}`;

      teams.push({
        id,
        admin: admin as `0x${string}`,
        name,
        description,
        maxMembers,
        revealAtBlock,
        isRevealed,
        rosterRoot,
        members
      });
    }
    return teams;
  } catch {
    return [];
  }
}

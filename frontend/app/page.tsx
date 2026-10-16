import { Dashboard } from "@/components/dashboard";
import { activeChain, addresses, isConfigured } from "@/lib/config";
import { getCourseCommitments, getTeams } from "@/lib/chain";
import type { TeamView } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [teams, commitments] = await Promise.all([getTeams(), getCourseCommitments()]);

  const teamViews: TeamView[] = teams.map((team) => ({
    id: team.id.toString(),
    admin: team.admin,
    name: team.name,
    description: team.description,
    maxMembers: team.maxMembers.toString(),
    revealAtBlock: team.revealAtBlock.toString(),
    isRevealed: team.isRevealed,
    rosterRoot: team.rosterRoot,
    members: team.members.map((m) => m.toString())
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">TeamUp ZK</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Anonymous team formation with Semaphore zero-knowledge membership proofs.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          chain: {activeChain.name} ({activeChain.id}) · registry{" "}
          <span className="font-mono">{addresses.registry}</span>
        </p>
      </header>

      <Dashboard
        teams={teamViews}
        commitments={commitments.map((c) => c.toString())}
        configured={isConfigured}
      />
    </main>
  );
}

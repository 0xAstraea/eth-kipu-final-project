"use client";

import { CreateTeamForm } from "@/components/create-team-form";
import { IdentitiesPanel } from "@/components/identities-panel";
import { TeamCard } from "@/components/team-card";
import { WalletBar } from "@/components/wallet-bar";
import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses } from "@/lib/config";
import { createIdentity } from "@/lib/identity";
import type { IdentityView, StoredClaim, TeamView } from "@/lib/types";
import { useLocalList } from "@/lib/use-local-list";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";

type Props = {
  teams: TeamView[];
  commitments: string[];
  configured: boolean;
};

export function Dashboard({ teams, commitments, configured }: Props) {
  const router = useRouter();
  const { address } = useAccount();

  const identitiesStore = useLocalList<IdentityView>("teamup-zk-identities");
  const claimsStore = useLocalList<StoredClaim>("teamup-zk-claims");
  const identities = identitiesStore.list;
  const claims = claimsStore.list;
  const [identityError, setIdentityError] = useState("");

  const { data: owner } = useReadContract({
    address: addresses.registry,
    abi: teamRegistryAbi,
    functionName: "owner",
    query: { enabled: configured }
  });

  const isOwner = !!address && !!owner && address.toLowerCase() === (owner as string).toLowerCase();
  const refresh = () => router.refresh();

  async function onCreate() {
    try {
      setIdentityError("");
      identitiesStore.add(await createIdentity(`Identity ${identities.length + 1}`));
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WalletBar />
        {!configured && (
          <span className="text-xs text-amber-400">
            Contracts not configured. Set NEXT_PUBLIC_* addresses in frontend/.env.local and restart.
          </span>
        )}
        {identityError && <span className="text-xs text-red-400">Identity error: {identityError}</span>}
      </div>

      <IdentitiesPanel
        identities={identities}
        courseCommitments={commitments}
        isOwner={isOwner}
        owner={owner as string | undefined}
        connected={address}
        onCreate={onCreate}
        onDelete={(id) => identitiesStore.remove((identity) => identity.id === id)}
        onChanged={refresh}
      />

      <CreateTeamForm identities={identities} courseCommitments={commitments} onCreated={refresh} />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Teams ({teams.length})
        </h2>
        {teams.length === 0 ? (
          <p className="text-sm text-neutral-500">No teams yet. Create the first one above.</p>
        ) : (
          teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              identities={identities}
              courseCommitments={commitments}
              claims={claims}
              onChanged={refresh}
              onAddClaim={(claim) => claimsStore.add(claim)}
            />
          ))
        )}
      </section>
    </div>
  );
}

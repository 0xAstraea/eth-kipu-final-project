"use client";

import { CreateTeamForm } from "@/components/create-team-form";
import { CourseRoster, IdentityPanel } from "@/components/identities-panel";
import { PersonaHeader, PersonaTabs } from "@/components/persona-tabs";
import { TeamCard } from "@/components/team-card";
import { WalletBar } from "@/components/wallet-bar";
import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses } from "@/lib/config";
import { createIdentity } from "@/lib/identity";
import { shorten } from "@/lib/format";
import { usePersonas } from "@/lib/personas";
import type { IdentityView, StoredClaim, TeamView } from "@/lib/types";
import { useLocalList, useLocalValue } from "@/lib/use-local-list";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";

type Props = {
  teams: TeamView[];
  commitments: string[];
  configured: boolean;
};

export function Dashboard({ teams, commitments, configured }: Props) {
  const router = useRouter();
  const { address } = useAccount();

  const personas = usePersonas();
  const identitiesStore = useLocalList<IdentityView>("teamup-zk-identities");
  const claimsStore = useLocalList<StoredClaim>("teamup-zk-claims");
  // teamId -> persona that created it. The contract stores the admin as a wallet address;
  // this local map is what lets the UI show the review panel on the right persona.
  const { value: teamOwners, set: setTeamOwners } = useLocalValue<Record<string, string>>(
    "teamup-zk-team-owners"
  );
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

  // Identities and claims created before personas existed belong to the professor.
  useEffect(() => {
    const fallback = personas.personas.find((persona) => persona.role === "professor")?.id ?? personas.personas[0]?.id;
    if (!fallback) return;
    if (identities.some((identity) => !identity.personaId)) {
      identitiesStore.set(
        identities.map((identity) => (identity.personaId ? identity : { ...identity, personaId: fallback }))
      );
    }
    if (claims.some((claim) => !claim.personaId)) {
      claimsStore.set(claims.map((claim) => (claim.personaId ? claim : { ...claim, personaId: fallback })));
    }
  }, [identities, claims, personas.personas, identitiesStore, claimsStore]);

  const persona = personas.active;
  const personaIdentities = identities.filter((identity) => identity.personaId === persona.id);
  const personaClaims = claims.filter((claim) => claim.personaId === persona.id);
  const isProfessor = persona.role === "professor";

  async function onCreateIdentity() {
    try {
      setIdentityError("");
      const identity = await createIdentity(`Identity ${personaIdentities.length + 1}`, persona.id);
      identitiesStore.add(identity);
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : String(err));
    }
  }

  function onRemovePersona(id: string) {
    personas.removePersona(id);
    identitiesStore.set(identities.filter((identity) => identity.personaId !== id));
    claimsStore.set(claims.filter((claim) => claim.personaId !== id));
  }

  function onTeamCreated(teamId: string) {
    setTeamOwners({ ...(teamOwners ?? {}), [teamId]: persona.id });
  }

  /** The persona that owns a team is the one that created it; fall back to the
   * contract's admin wallet when the team was created elsewhere. */
  function ownsTeam(team: TeamView): boolean {
    const owner = teamOwners?.[team.id];
    if (owner) return owner === persona.id;
    return !!address && team.admin.toLowerCase() === address.toLowerCase();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WalletBar />
        {!configured && (
          <span className="text-xs text-amber-400">
            Contracts not configured. Set NEXT_PUBLIC_* addresses in frontend/.env.local and restart.
          </span>
        )}
        {identityError && <span className="text-xs text-red-400">Identity error: {identityError}</span>}
      </div>

      <PersonaTabs
        personas={personas.personas}
        activeId={personas.activeId}
        onSelect={personas.setActive}
        onAdd={() => personas.addPersona("student")}
      />

      <PersonaHeader
        persona={persona}
        connected={address}
        onRename={(name) => personas.renamePersona(persona.id, name)}
        onRemove={() => onRemovePersona(persona.id)}
        onSetWallet={(wallet) => personas.setWallet(persona.id, wallet)}
      />

      <div key={persona.id} className="animate-panel-in space-y-5">
        {persona.wallet && address && persona.wallet.toLowerCase() !== address.toLowerCase() && (
          <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
            {persona.name} acts from <span className="font-mono">{shorten(persona.wallet, 4)}</span>, but the
            connected wallet is <span className="font-mono">{shorten(address, 4)}</span>. Switch accounts in your
            wallet to act as this persona.
          </p>
        )}

        {isProfessor ? (
          <>
            <CourseRoster
              personas={personas.personas}
              identities={identities}
              courseCommitments={commitments}
              isOwner={isOwner}
              owner={owner as string | undefined}
              connected={address}
              onChanged={refresh}
            />
            <CreateTeamForm
              persona={persona}
              identities={personaIdentities}
              courseCommitments={commitments}
              onCreated={(teamId) => {
                onTeamCreated(teamId);
                refresh();
              }}
            />
          </>
        ) : (
          <>
            <IdentityPanel
              identities={personaIdentities}
              courseCommitments={commitments}
              onCreate={onCreateIdentity}
              onDelete={(id) => identitiesStore.remove((identity) => identity.id === id)}
            />
            <CreateTeamForm
              persona={persona}
              identities={personaIdentities}
              courseCommitments={commitments}
              onCreated={(teamId) => {
                onTeamCreated(teamId);
                refresh();
              }}
            />
          </>
        )}

        <section className="space-y-3">
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
                isTeamOwner={ownsTeam(team)}
                persona={persona}
                identities={personaIdentities}
                courseCommitments={commitments}
                claims={personaClaims}
                onChanged={refresh}
                onAddClaim={(claim) => claimsStore.add(claim)}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}

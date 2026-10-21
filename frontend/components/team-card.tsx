"use client";

import { Badge, Button, Select, TextInput } from "@/components/ui";
import { teamCredentialAbi } from "@/lib/abis/teamCredential";
import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses } from "@/lib/config";
import { formatBig, shorten } from "@/lib/format";
import { randomSalt } from "@/lib/identity";
import { claimCommitmentOf, joinProof } from "@/lib/semaphore";
import type { IdentityView, Persona, StoredClaim, TeamView } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import { parseAbiItem, type Address } from "viem";
import { useAccount, useBlockNumber, usePublicClient, useReadContracts, useWriteContract } from "wagmi";

const joinRequested = parseAbiItem(
  "event JoinRequested(uint256 indexed teamId, uint256 indexed nullifier, string presentation)"
);
const credentialMinted = parseAbiItem(
  "event CredentialMinted(address indexed to, uint256 indexed tokenId, uint256 indexed teamId)"
);
const credentialClaimed = parseAbiItem(
  "event CredentialClaimed(uint256 indexed teamId, uint256 indexed nullifier, address indexed claimAddress)"
);

const fromBlock = BigInt(process.env.NEXT_PUBLIC_FROM_BLOCK ?? "0");

type Application = { nullifier: string; presentation: string };

type Props = {
  team: TeamView;
  /**
   * True when the active persona is the one that created this team, i.e. the team
   * admin. Only the admin accepts applicants — that power comes from the contract
   * (`msg.sender == team.admin`), not from being the course owner.
   */
  isTeamOwner: boolean;
  persona: Persona;
  identities: IdentityView[];
  courseCommitments: string[];
  claims: StoredClaim[];
  onChanged: () => void;
  onAddClaim: (claim: StoredClaim) => void;
};

export function TeamCard({
  team,
  isTeamOwner,
  persona,
  identities,
  courseCommitments,
  claims,
  onChanged,
  onAddClaim
}: Props) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: blockNumber } = useBlockNumber();

  const [applications, setApplications] = useState<Application[]>([]);
  const [identityId, setIdentityId] = useState("");
  const [presentation, setPresentation] = useState("");
  const [claimAddress, setClaimAddress] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tokenMeta, setTokenMeta] = useState<Record<string, string>>({});

  const isTeamAdmin = !!address && team.admin.toLowerCase() === address.toLowerCase();
  const teamClaims = useMemo(() => claims.filter((claim) => claim.teamId === team.id), [claims, team.id]);
  const enrolled = identities.filter((identity) => courseCommitments.includes(identity.commitment));

  const { data: applicationStates } = useReadContracts({
    contracts: teamClaims.map((stored) => ({
      address: addresses.registry,
      abi: teamRegistryAbi,
      functionName: "getApplication" as const,
      args: [BigInt(stored.teamId), BigInt(stored.nullifier)] as const
    })),
    query: { enabled: teamClaims.length > 0 }
  });

  // Nullifiers whose application is actually claimed on-chain. Only these have a token.
  const claimedNullifiers = useMemo(
    () =>
      new Set(
        teamClaims
          .filter((_, index) => {
            const state = applicationStates?.[index];
            return state?.status === "success" && state.result?.[2] === true;
          })
          .map((stored) => stored.nullifier)
      ),
    [applicationStates, teamClaims]
  );

  // Applications are read in every tab: the team owner reviews them, and every persona
  // needs them to detect "this identity already applied" before sending a doomed tx.
  useEffect(() => {
    if (!publicClient) return;
    let active = true;
    publicClient
      .getLogs({
        address: addresses.registry,
        event: joinRequested,
        args: { teamId: BigInt(team.id) },
        fromBlock,
        toBlock: "latest"
      })
      .then((logs) => {
        if (!active) return;
        setApplications(
          logs.map((log) => ({
            nullifier: (log.args.nullifier as bigint).toString(),
            presentation: log.args.presentation as string
          }))
        );
      })
      .catch(() => active && setApplications([]));
    return () => {
      active = false;
    };
  }, [publicClient, team.id]);

  useEffect(() => {
    if (!publicClient) return;
    let active = true;
    (async () => {
      for (const stored of teamClaims) {
        // Only claimed applications have a token; pending/never-accepted ones do not.
        if (!claimedNullifiers.has(stored.nullifier)) continue;
        if (tokenMeta[stored.nullifier]) continue;
        try {
          // Find the claim of THIS application (CredentialClaimed carries the nullifier),
          // then the mint produced in the same transaction. Filtering by (teamId, to)
          // alone is ambiguous when several applications share a claim address.
          const claimLogs = await publicClient.getLogs({
            address: addresses.registry,
            event: credentialClaimed,
            args: { teamId: BigInt(stored.teamId), nullifier: BigInt(stored.nullifier) },
            fromBlock,
            toBlock: "latest"
          });
          const claimLog = claimLogs.at(-1);
          if (!claimLog) continue;
          const minted = await publicClient.getLogs({
            address: addresses.credential,
            event: credentialMinted,
            fromBlock: claimLog.blockNumber,
            toBlock: claimLog.blockNumber
          });
          const mint = minted.find((log) => log.transactionHash === claimLog.transactionHash);
          if (!mint) continue;
          const tokenId = mint.args.tokenId as bigint;
          const uri = (await publicClient.readContract({
            address: addresses.credential,
            abi: teamCredentialAbi,
            functionName: "tokenURI",
            args: [tokenId]
          })) as string;
          if (active) setTokenMeta((prev) => ({ ...prev, [stored.nullifier]: `${tokenId.toString()}|${uri}` }));
        } catch {
          // ignore: token metadata is decorative
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [publicClient, teamClaims, tokenMeta, claimedNullifiers]);

  async function apply(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const identity = enrolled.find((i) => i.id === identityId) ?? enrolled[0];
    if (!identity) {
      setError("Create and enroll an identity first.");
      return;
    }
    const recipient = (claimAddress || address) as Address | undefined;
    if (!recipient) {
      setError("Connect a wallet or provide a claim address.");
      return;
    }

    try {
      setBusy("Generating zero-knowledge proof in your browser…");
      const salt = randomSalt();
      const claimCommitment = claimCommitmentOf(recipient, salt);
      const proof = await joinProof(
        identity.privateKey,
        courseCommitments.map((c) => BigInt(c)),
        BigInt(team.id),
        presentation,
        claimCommitment
      );

      // Semaphore's nullifier depends only on (identity, scope=teamId), so an identity
      // that already occupies a slot in this team (its creator, or an accepted member)
      // will produce a burned nullifier and the proof is rejected on-chain. Detect it
      // here and explain, instead of surfacing the cryptic Semaphore revert.
      const nullifier = proof.nullifier.toString();
      if (team.members.includes(nullifier)) {
        setError(
          "This identity already holds a slot in this team (the creator starts as member #1). Pick another identity."
        );
        setBusy("");
        return;
      }
      if (applications.some((app) => app.nullifier === nullifier)) {
        setError("This identity has already applied to this team.");
        setBusy("");
        return;
      }

      setBusy("Awaiting wallet confirmation…");
      if (publicClient && address) {
        await publicClient.simulateContract({
          account: address,
          address: addresses.registry,
          abi: teamRegistryAbi,
          functionName: "requestJoin",
          args: [BigInt(team.id), presentation, claimCommitment, proof]
        });
      }
      const hash = await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "requestJoin",
        args: [BigInt(team.id), presentation, claimCommitment, proof]
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      onAddClaim({
        teamId: team.id,
        nullifier: proof.nullifier.toString(),
        claimAddress: recipient,
        salt: salt.toString(),
        presentation,
        identityLabel: identity.label,
        personaId: persona.id
      });
      setBusy("Application submitted anonymously.");
      setPresentation("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy("");
    }
  }

  async function accept(nullifier: string) {
    setError("");
    try {
      if (publicClient && address) {
        await publicClient.simulateContract({
          account: address,
          address: addresses.registry,
          abi: teamRegistryAbi,
          functionName: "acceptRequest",
          args: [BigInt(team.id), BigInt(nullifier)]
        });
      }
      const hash = await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "acceptRequest",
        args: [BigInt(team.id), BigInt(nullifier)]
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function reveal() {
    setError("");
    try {
      if (publicClient && address) {
        await publicClient.simulateContract({
          account: address,
          address: addresses.registry,
          abi: teamRegistryAbi,
          functionName: "reveal",
          args: [BigInt(team.id)]
        });
      }
      const hash = await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "reveal",
        args: [BigInt(team.id)]
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function claim(stored: StoredClaim) {
    setError("");
    try {
      setBusy("Claiming credential…");
      const claimArgs = [
        BigInt(stored.teamId),
        BigInt(stored.nullifier),
        stored.claimAddress as Address,
        BigInt(stored.salt)
      ] as const;
      if (publicClient && address) {
        await publicClient.simulateContract({
          account: address,
          address: addresses.registry,
          abi: teamRegistryAbi,
          functionName: "claimCredential",
          args: claimArgs
        });
      }
      const hash = await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "claimCredential",
        args: claimArgs
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
        const logs = await publicClient.getLogs({
          address: addresses.credential,
          event: credentialMinted,
          args: { teamId: BigInt(stored.teamId), to: stored.claimAddress as Address },
          fromBlock,
          toBlock: "latest"
        });
        const last = logs.at(-1);
        if (last) {
          const tokenId = last.args.tokenId as bigint;
          const uri = (await publicClient.readContract({
            address: addresses.credential,
            abi: teamCredentialAbi,
            functionName: "tokenURI",
            args: [tokenId]
          })) as string;
          setTokenMeta((prev) => ({ ...prev, [stored.nullifier]: `${tokenId.toString()}|${uri}` }));
        }
      }
      setBusy("Credential claimed.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy("");
    }
  }

  const pending = applications.filter((app) => !team.members.includes(app.nullifier));
  const full = team.members.length >= Number(team.maxMembers);
  const deadlineReached =
    team.revealAtBlock !== "0" && blockNumber !== undefined && blockNumber >= BigInt(team.revealAtBlock);
  const canReveal = !team.isRevealed && (full || deadlineReached);

  return (
    <article className="rounded-lg border border-neutral-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            #{team.id} {team.name}
          </h3>
          {team.description && <p className="text-sm text-neutral-400">{team.description}</p>}
          <p className="mt-1 text-xs text-neutral-500">
            admin <span className="font-mono">{shorten(team.admin, 4)}</span> · {team.members.length}/
            {team.maxMembers} members
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {team.isRevealed ? (
              <Badge tone="emerald">revealed</Badge>
            ) : (
              <Badge tone={full ? "amber" : "neutral"}>{full ? "full · ready to reveal" : "forming"}</Badge>
            )}
            {team.isRevealed && (
              <span className="text-xs text-neutral-500">
                roster root <span className="font-mono">{shorten(team.rosterRoot, 6)}</span>
              </span>
            )}
          </div>
        </div>
        {canReveal && (
          <Button onClick={reveal} title="Freeze the team and commit its roster">
            Reveal
          </Button>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Members (nullifiers)</p>
        <ul className="mt-1 space-y-1">
          {team.members.map((nullifier) => (
            <li key={nullifier} className="font-mono text-xs text-neutral-400">
              {formatBig(nullifier, 10)}
            </li>
          ))}
        </ul>
      </div>

      {isTeamOwner && (
        <div className="mt-3 rounded-md bg-neutral-900/60 p-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Applications to review ({pending.length})
          </p>
          {pending.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">No pending applications.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {pending.map((app) => (
                <li key={app.nullifier} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{app.presentation || "(no presentation)"}</p>
                    <p className="font-mono text-xs text-neutral-500">{formatBig(app.nullifier, 8)}</p>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => accept(app.nullifier)}
                    disabled={!isTeamAdmin}
                    title={
                      isTeamAdmin
                        ? "Accept this nullifier into the team"
                        : `Only the team admin wallet (${shorten(team.admin, 4)}) can accept`
                    }
                  >
                    Accept
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!isTeamAdmin && (
            <p className="mt-2 text-xs text-neutral-500">
              You created this team, but accepting requires the admin wallet{" "}
              <span className="font-mono">{shorten(team.admin, 4)}</span>.
            </p>
          )}
        </div>
      )}

      {!team.isRevealed && full && (
        <p className="mt-3 rounded-md bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400">
          This team is full. Revealing freezes the roster and unlocks the credentials — anyone can
          trigger it, but the team owner usually does.
        </p>
      )}

      {!team.isRevealed && !full && persona.role === "student" && (
        <form onSubmit={apply} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Apply anonymously</p>
          {enrolled.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {persona.name} has no enrolled identity yet. Create one below and ask the professor to enrol it.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-neutral-400">
                  Membership identity
                  <Select value={identityId} onChange={(event) => setIdentityId(event.target.value)} className="mt-1">
                    {enrolled.map((identity) => (
                      <option key={identity.id} value={identity.id}>
                        {identity.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block text-xs text-neutral-400">
                  Credential address (optional)
                  <TextInput
                    value={claimAddress}
                    onChange={(event) => setClaimAddress(event.target.value)}
                    placeholder={address ?? "0x…"}
                    className="mt-1 font-mono"
                  />
                  <span className="mt-1 block text-[11px] leading-relaxed text-neutral-500">
                    Where the credential NFT will be minted. Leave it empty to use your connected
                    wallet, or set a separate address to keep the credential unlinked from your
                    main account.
                  </span>
                </label>
              </div>
              <label className="block text-xs text-neutral-400">
                Presentation (skills / motivation)
                <TextInput
                  value={presentation}
                  onChange={(event) => setPresentation(event.target.value)}
                  required
                  className="mt-1"
                />
              </label>
              {!!address && (!claimAddress || claimAddress.toLowerCase() === address.toLowerCase()) && (
                <p className="text-[11px] leading-relaxed text-amber-400/90">
                  The credential will be publicly tied to{" "}
                  <span className="font-mono">{shorten(address, 4)}</span> once claimed. That is
                  fine for a demo, but on a real chain it marks that account as a course member.
                </p>
              )}
              <Button type="submit" variant="primary" size="md" disabled={!!busy}>
                {busy || "Generate proof & apply"}
              </Button>
            </>
          )}
        </form>
      )}

      {teamClaims.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-neutral-800 pt-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Your application</p>
          {teamClaims.map((stored, index) => {
            const meta = tokenMeta[stored.nullifier];
            const state = applicationStates?.[index];
            const onChain = state?.status === "success" ? state.result : undefined;
            const accepted = onChain ? onChain[1] : team.members.includes(stored.nullifier);
            const claimed = onChain ? onChain[2] : false;
            return (
              <div key={stored.nullifier} className="rounded-md bg-neutral-900/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-neutral-400">{formatBig(stored.nullifier, 8)}</span>
                  {claimed ? (
                    <Badge tone="emerald">credential claimed</Badge>
                  ) : accepted && team.isRevealed ? (
                    <Button onClick={() => claim(stored)}>Claim credential</Button>
                  ) : accepted ? (
                    <span className="text-xs text-neutral-500">waiting for team reveal</span>
                  ) : (
                    <span className="text-xs text-neutral-500">waiting for admin acceptance</span>
                  )}
                </div>
                {claimed && meta && (
                  <p className="mt-2 break-all text-xs text-emerald-400">
                    token #{meta.split("|")[0]} · {decodeTokenURI(meta.split("|")[1])}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {busy && !error && <p className="mt-3 text-xs text-neutral-400">{busy}</p>}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </article>
  );
}

function decodeTokenURI(uri: string): string {
  try {
    const base64 = uri.split(",")[1];
    const json = JSON.parse(atob(base64));
    return json.name;
  } catch {
    return uri.slice(0, 40);
  }
}

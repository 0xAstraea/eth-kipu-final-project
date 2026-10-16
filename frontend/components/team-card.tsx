"use client";

import { teamCredentialAbi } from "@/lib/abis/teamCredential";
import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses } from "@/lib/config";
import { formatBig, shorten } from "@/lib/format";
import { randomSalt } from "@/lib/identity";
import { claimCommitmentOf, joinProof } from "@/lib/semaphore";
import type { IdentityView, StoredClaim, TeamView } from "@/lib/types";
import { useEffect, useState } from "react";
import { parseAbiItem, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

const joinRequested = parseAbiItem(
  "event JoinRequested(uint256 indexed teamId, uint256 indexed nullifier, string presentation)"
);
const credentialMinted = parseAbiItem(
  "event CredentialMinted(address indexed to, uint256 indexed tokenId, uint256 indexed teamId)"
);

const fromBlock = BigInt(process.env.NEXT_PUBLIC_FROM_BLOCK ?? "0");

type Application = { nullifier: string; presentation: string };

type Props = {
  team: TeamView;
  identities: IdentityView[];
  courseCommitments: string[];
  claims: StoredClaim[];
  onChanged: () => void;
  onAddClaim: (claim: StoredClaim) => void;
};

export function TeamCard({ team, identities, courseCommitments, claims, onChanged, onAddClaim }: Props) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [applications, setApplications] = useState<Application[]>([]);
  const [identityId, setIdentityId] = useState("");
  const [presentation, setPresentation] = useState("");
  const [claimAddress, setClaimAddress] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tokenMeta, setTokenMeta] = useState<Record<string, string>>({});

  const isAdmin = address && team.admin.toLowerCase() === address.toLowerCase();
  const teamClaims = claims.filter((claim) => claim.teamId === team.id);
  const enrolled = identities.filter((identity) => courseCommitments.includes(identity.commitment));

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
      setBusy("Awaiting wallet confirmation…");
      await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "requestJoin",
        args: [BigInt(team.id), presentation, claimCommitment, proof]
      });
      onAddClaim({
        teamId: team.id,
        nullifier: proof.nullifier.toString(),
        claimAddress: recipient,
        salt: salt.toString(),
        presentation,
        identityLabel: identity.label
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
      await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "acceptRequest",
        args: [BigInt(team.id), BigInt(nullifier)]
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function reveal() {
    setError("");
    try {
      await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "reveal",
        args: [BigInt(team.id)]
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function claim(stored: StoredClaim) {
    setError("");
    try {
      setBusy("Claiming credential…");
      await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "claimCredential",
        args: [BigInt(stored.teamId), BigInt(stored.nullifier), stored.claimAddress as Address, BigInt(stored.salt)]
      });
      if (publicClient) {
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

  return (
    <article className="rounded-lg border border-neutral-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            #{team.id} {team.name}
          </h3>
          {team.description && <p className="text-sm text-neutral-400">{team.description}</p>}
          <p className="mt-1 text-xs text-neutral-500">
            admin <span className="font-mono">{shorten(team.admin, 4)}</span> · {team.members.length}/
            {team.maxMembers} members
            {team.isRevealed ? " · revealed" : ""}
          </p>
        </div>
        {isAdmin && !team.isRevealed && (
          <button
            onClick={reveal}
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-900"
          >
            Reveal
          </button>
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

      {isAdmin && pending.length > 0 && !team.isRevealed && (
        <div className="mt-3 rounded-md bg-neutral-900/60 p-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Pending applications</p>
          <ul className="mt-2 space-y-2">
            {pending.map((app) => (
              <li key={app.nullifier} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{app.presentation || "(no presentation)"}</p>
                  <p className="font-mono text-xs text-neutral-500">{formatBig(app.nullifier, 8)}</p>
                </div>
                <button
                  onClick={() => accept(app.nullifier)}
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-emerald-400"
                >
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!team.isRevealed && team.members.length < Number(team.maxMembers) && (
        <form onSubmit={apply} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Apply anonymously</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-neutral-400">
              Membership identity
              <select
                value={identityId}
                onChange={(e) => setIdentityId(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
              >
                {enrolled.length === 0 && <option value="">no enrolled identity</option>}
                {enrolled.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-neutral-400">
              Claim address (NFT recipient, optional)
              <input
                value={claimAddress}
                onChange={(e) => setClaimAddress(e.target.value)}
                placeholder={address ?? "0x…"}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm"
              />
            </label>
          </div>
          <label className="block text-xs text-neutral-400">
            Presentation (skills / motivation)
            <input
              value={presentation}
              onChange={(e) => setPresentation(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={!!busy}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy || "Generate proof & apply"}
          </button>
        </form>
      )}

      {teamClaims.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-neutral-800 pt-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">My claims</p>
          {teamClaims.map((stored) => {
            const meta = tokenMeta[stored.nullifier];
            return (
              <div key={stored.nullifier} className="rounded-md bg-neutral-900/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-neutral-400">{formatBig(stored.nullifier, 8)}</span>
                  <button
                    onClick={() => claim(stored)}
                    className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-900"
                  >
                    Claim credential
                  </button>
                </div>
                {meta && (
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

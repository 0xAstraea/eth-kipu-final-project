"use client";

import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses } from "@/lib/config";
import { createTeamProof } from "@/lib/semaphore";
import type { IdentityView } from "@/lib/types";
import { useState } from "react";
import { useAccount, useReadContract, usePublicClient, useWriteContract } from "wagmi";

type Props = {
  identities: IdentityView[];
  courseCommitments: string[];
  onCreated: () => void;
};

export function CreateTeamForm({ identities, courseCommitments, onCreated }: Props) {
  const [identityId, setIdentityId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxMembers, setMaxMembers] = useState("3");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();
  const { data: nextTeamId } = useReadContract({
    address: addresses.registry,
    abi: teamRegistryAbi,
    functionName: "nextTeamId"
  });

  const enrolled = identities.filter((identity) => courseCommitments.includes(identity.commitment));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const identity = enrolled.find((i) => i.id === identityId) ?? enrolled[0];
    if (!identity) {
      setError("Create and enroll an identity first (only the course owner can enroll).");
      return;
    }
    if (nextTeamId === undefined) {
      setError("Could not read the next team id.");
      return;
    }

    try {
      setStatus("Generating zero-knowledge proof in your browser…");
      const proof = await createTeamProof(
        identity.privateKey,
        courseCommitments.map((c) => BigInt(c)),
        nextTeamId
      );
      setStatus("Awaiting wallet confirmation…");
      if (publicClient && address) {
        await publicClient.simulateContract({
          account: address,
          address: addresses.registry,
          abi: teamRegistryAbi,
          functionName: "createTeam",
          args: [name, description, BigInt(maxMembers), 0n, proof]
        });
      }
      const hash = await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "createTeam",
        args: [name, description, BigInt(maxMembers), 0n, proof]
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setStatus("Team created.");
      setName("");
      setDescription("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("");
    }
  }

  return (
    <section className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">Create team</h2>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-neutral-400">
            Team name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            />
          </label>
          <label className="block text-xs text-neutral-400">
            Max members
            <input
              type="number"
              min={1}
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            />
          </label>
        </div>
        <label className="block text-xs text-neutral-400">
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          Prove membership with identity
          <select
            value={identityId}
            onChange={(e) => setIdentityId(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          >
            {enrolled.length === 0 && <option value="">no enrolled identity</option>}
            {enrolled.map((identity) => (
              <option key={identity.id} value={identity.id}>
                {identity.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {isPending ? "Working…" : "Generate proof & create team"}
        </button>
        {status && <p className="text-xs text-neutral-400">{status}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>
    </section>
  );
}

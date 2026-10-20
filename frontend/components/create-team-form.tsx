"use client";

import { Button, Section, Select, TextInput } from "@/components/ui";
import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses } from "@/lib/config";
import { createTeamProof } from "@/lib/semaphore";
import type { IdentityView, Persona } from "@/lib/types";
import { useState } from "react";
import { useAccount, useReadContract, usePublicClient, useWriteContract } from "wagmi";

type Props = {
  persona: Persona;
  identities: IdentityView[];
  courseCommitments: string[];
  /** Receives the id of the team that was just created. */
  onCreated: (teamId: string) => void;
};

export function CreateTeamForm({ persona, identities, courseCommitments, onCreated }: Props) {
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
      setError("Create and enrol an identity first (only the course owner can enrol).");
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
      onCreated(nextTeamId.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("");
    }
  }

  return (
    <Section
      title="Create a team"
      description={`${persona.name} creates the team and becomes its admin (member #1) with a ZK proof of course membership.`}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-neutral-400">
            Team name
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="mt-1"
              placeholder="TeamUp"
            />
          </label>
          <label className="block text-xs text-neutral-400">
            Max members
            <TextInput
              type="number"
              min={1}
              value={maxMembers}
              onChange={(event) => setMaxMembers(event.target.value)}
              required
              className="mt-1"
            />
          </label>
        </div>
        <label className="block text-xs text-neutral-400">
          Description
          <TextInput
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1"
            placeholder="What this team is about"
          />
        </label>
        {enrolled.length > 0 && (
          <label className="block text-xs text-neutral-400">
            Prove membership with identity
            <Select value={identityId} onChange={(event) => setIdentityId(event.target.value)} className="mt-1">
              {enrolled.map((identity) => (
                <option key={identity.id} value={identity.id}>
                  {identity.label}
                </option>
              ))}
            </Select>
          </label>
        )}
        <Button type="submit" variant="primary" size="md" disabled={isPending}>
          {isPending ? "Working…" : "Generate proof & create team"}
        </Button>
        {status && <p className="text-xs text-neutral-400">{status}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>
    </Section>
  );
}

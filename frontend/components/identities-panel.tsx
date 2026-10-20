"use client";

import { Badge, Button, Section } from "@/components/ui";
import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses } from "@/lib/config";
import { formatBig, shorten } from "@/lib/format";
import type { IdentityView, Persona } from "@/lib/types";
import { useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";

type Props = {
  identities: IdentityView[];
  courseCommitments: string[];
  isOwner: boolean;
  owner?: string;
  connected?: string;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
};

/** Student view: the identities this persona owns, and whether the course accepted them. */
export function IdentityPanel({
  identities,
  courseCommitments,
  onCreate,
  onDelete
}: Omit<Props, "isOwner" | "owner" | "connected" | "onChanged">) {
  return (
    <Section
      title="My identities"
      description="A Semaphore identity proves course membership without revealing who you are."
      actions={
        <Button onClick={onCreate} variant="primary">
          + New identity
        </Button>
      }
    >
      {identities.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No identity yet. The private key is generated in your browser and never leaves it; only the
          commitment is ever published.
        </p>
      ) : (
        <ul className="space-y-2">
          {identities.map((identity) => {
            const enrolled = courseCommitments.includes(identity.commitment);
            return (
              <li
                key={identity.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-neutral-900/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm">{identity.label}</p>
                  <p className="font-mono text-xs text-neutral-500" title={identity.commitment}>
                    commitment {formatBig(identity.commitment)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {enrolled ? (
                    <Badge tone="emerald">enrolled in course</Badge>
                  ) : (
                    <Badge tone="amber">awaiting enrolment</Badge>
                  )}
                  <Button variant="danger" onClick={() => onDelete(identity.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

type RosterProps = {
  personas: Persona[];
  identities: IdentityView[];
  courseCommitments: string[];
  isOwner: boolean;
  owner?: string;
  connected?: string;
  onChanged: () => void;
};

/** Professor view: the course roster, one row per student persona. */
export function CourseRoster({
  personas,
  identities,
  courseCommitments,
  isOwner,
  owner,
  connected,
  onChanged
}: RosterProps) {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const students = personas.filter((persona) => persona.role === "student");

  async function enrollOne(commitment: string) {
    setError("");
    try {
      setBusy("Enrolling…");
      const hash = await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "addCourseMember",
        args: [BigInt(commitment)]
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setBusy("");
      onChanged();
    } catch (err) {
      setBusy("");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function enrollAll(commitments: string[]) {
    setError("");
    try {
      setBusy(`Enrolling ${commitments.length} students…`);
      const hash = await writeContractAsync({
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "addCourseMembers",
        args: [commitments.map((c) => BigInt(c))]
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setBusy("");
      onChanged();
    } catch (err) {
      setBusy("");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const pendingCommitments = identities
    .filter((identity) => !courseCommitments.includes(identity.commitment))
    .map((identity) => identity.commitment);

  return (
    <Section
      title="Course roster"
      description="Enrolling a commitment adds that student to the Semaphore group. Only you can do it."
      actions={
        pendingCommitments.length > 0 && (
          <Button
            variant="primary"
            disabled={isPending || !isOwner}
            onClick={() => enrollAll(pendingCommitments)}
            title={isOwner ? "Enrol everyone pending in one transaction" : "Only the course owner can enrol"}
          >
            Enrol all pending ({pendingCommitments.length})
          </Button>
        )
      }
    >
      {students.length === 0 ? (
        <p className="text-sm text-neutral-500">No students yet. Add a student persona to start the roster.</p>
      ) : (
        <ul className="space-y-2">
          {students.map((persona) => {
            const own = identities.filter((identity) => identity.personaId === persona.id);
            return (
              <li key={persona.id} className="rounded-md bg-neutral-900/60 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{persona.name}</p>
                  <span className="text-xs text-neutral-500">
                    {own.length === 0
                      ? "no identity yet"
                      : `${own.filter((i) => courseCommitments.includes(i.commitment)).length}/${own.length} enrolled`}
                  </span>
                </div>
                {own.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {own.map((identity) => {
                      const enrolled = courseCommitments.includes(identity.commitment);
                      return (
                        <li key={identity.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs text-neutral-500">
                            {identity.label} · {formatBig(identity.commitment)}
                          </span>
                          {enrolled ? (
                            <Badge tone="emerald">enrolled</Badge>
                          ) : (
                            <Button
                              variant="primary"
                              disabled={isPending || !isOwner}
                              onClick={() => enrollOne(identity.commitment)}
                              title={isOwner ? "Enrol this student" : "Only the course owner can enrol"}
                            >
                              Enrol
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 border-t border-neutral-800 pt-3 text-xs">
        {isOwner ? (
          <p className="text-emerald-400">Connected as the course owner — you can enrol students.</p>
        ) : (
          <p className="text-amber-400">
            Only the course owner can enrol identities.
            {owner && (
              <>
                {" "}
                Owner: <span className="font-mono">{shorten(owner, 4)}</span>
              </>
            )}
            {connected && (
              <>
                {" "}
                · You: <span className="font-mono">{shorten(connected, 4)}</span>
              </>
            )}
            . Switch MetaMask to the owner account to enrol.
          </p>
        )}
      </div>
      {busy && <p className="mt-2 text-xs text-neutral-400">{busy}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Section>
  );
}

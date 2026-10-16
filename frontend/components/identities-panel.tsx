"use client";

import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses } from "@/lib/config";
import { formatBig } from "@/lib/format";
import type { IdentityView } from "@/lib/types";
import { useWriteContract } from "wagmi";

type Props = {
  identities: IdentityView[];
  courseCommitments: string[];
  isOwner: boolean;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
};

export function IdentitiesPanel({ identities, courseCommitments, isOwner, onCreate, onDelete, onChanged }: Props) {
  const { writeContract, isPending, error } = useWriteContract();

  function enroll(commitment: string) {
    writeContract(
      {
        address: addresses.registry,
        abi: teamRegistryAbi,
        functionName: "addCourseMember",
        args: [BigInt(commitment)]
      },
      { onSuccess: onChanged }
    );
  }

  return (
    <section className="rounded-lg border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">My identities</h2>
        <button
          onClick={onCreate}
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-900"
        >
          + New identity
        </button>
      </div>

      {identities.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Create a Semaphore identity. Only its commitment is stored; the private key never leaves your browser.
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
                    <span className="rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">enrolled</span>
                  ) : isOwner ? (
                    <button
                      onClick={() => enroll(identity.commitment)}
                      disabled={isPending}
                      className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
                    >
                      Enroll in course
                    </button>
                  ) : (
                    <span className="text-xs text-amber-400">not enrolled</span>
                  )}
                  <button
                    onClick={() => onDelete(identity.id)}
                    className="rounded-md border border-neutral-800 px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!isOwner && (
        <p className="mt-3 text-xs text-neutral-500">
          Only the course owner can enroll identities. Connect the owner account (the deployer) to add members.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error.message}</p>}
    </section>
  );
}

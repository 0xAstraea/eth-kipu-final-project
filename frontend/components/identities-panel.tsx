"use client";

import { teamRegistryAbi } from "@/lib/abis/teamRegistry";
import { addresses } from "@/lib/config";
import { formatBig, shorten } from "@/lib/format";
import type { IdentityView } from "@/lib/types";
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

export function IdentitiesPanel({
  identities,
  courseCommitments,
  isOwner,
  owner,
  connected,
  onCreate,
  onDelete,
  onChanged
}: Props) {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function enroll(commitment: string) {
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
                  ) : (
                    <button
                      onClick={() => enroll(identity.commitment)}
                      disabled={isPending || !isOwner}
                      title={isOwner ? "Enroll this identity in the course" : "Only the course owner can enroll"}
                      className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Enroll in course
                    </button>
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

      <div className="mt-3 border-t border-neutral-800 pt-3 text-xs">
        {isOwner ? (
          <p className="text-emerald-400">Connected as the course owner — you can enroll identities.</p>
        ) : (
          <p className="text-amber-400">
            Only the course owner can enroll identities.
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
            . Switch MetaMask to the owner account to enroll.
          </p>
        )}
      </div>
      {busy && <p className="mt-2 text-xs text-neutral-400">{busy}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  );
}

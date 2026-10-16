"use client";

import { activeChain } from "@/lib/config";
import { shorten } from "@/lib/format";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

export function WalletBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const injected = connectors[0];

  if (!isConnected) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => injected && connect({ connector: injected })}
          disabled={isPending}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
        {error && <span className="text-xs text-red-400">{error.message}</span>}
      </div>
    );
  }

  const wrongNetwork = chainId !== activeChain.id;

  return (
    <div className="flex items-center gap-3">
      <span className="rounded-md border border-neutral-800 px-3 py-1.5 font-mono text-xs">
        {shorten(address ?? "", 4)}
      </span>
      {wrongNetwork && (
        <button
          onClick={() => switchChain({ chainId: activeChain.id })}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-amber-400"
        >
          Switch to {activeChain.name}
        </button>
      )}
      <button
        onClick={() => disconnect()}
        className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900"
      >
        Disconnect
      </button>
    </div>
  );
}

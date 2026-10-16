"use client";

import { activeChain, rpcUrl } from "@/lib/config";
import { shorten } from "@/lib/format";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

export function WalletBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [notice, setNotice] = useState("");

  const injected = connectors[0];
  const wrongNetwork = isConnected && chainId !== activeChain.id;

  async function ensureNetwork() {
    setNotice("");
    try {
      await switchChainAsync({ chainId: activeChain.id });
    } catch {
      const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
      if (!eth) {
        setNotice("No injected wallet found.");
        return;
      }
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x" + activeChain.id.toString(16),
              chainName: activeChain.name,
              nativeCurrency: activeChain.nativeCurrency,
              rpcUrls: [rpcUrl]
            }
          ]
        });
        await switchChainAsync({ chainId: activeChain.id });
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function switchAccount() {
    setNotice("");
    const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }

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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="rounded-md border border-neutral-800 px-3 py-1.5 font-mono text-xs">
        {shorten(address ?? "", 4)}
      </span>
      {wrongNetwork && (
        <button
          onClick={ensureNetwork}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-amber-400"
        >
          Switch to {activeChain.name}
        </button>
      )}
      <button
        onClick={switchAccount}
        className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900"
      >
        Switch account
      </button>
      <button
        onClick={() => disconnect()}
        className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900"
      >
        Disconnect
      </button>
      {notice && <span className="text-xs text-red-400">{notice}</span>}
    </div>
  );
}

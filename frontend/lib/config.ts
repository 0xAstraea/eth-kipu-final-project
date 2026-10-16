import { createPublicClient, defineChain, http, isAddress, type Address, type Chain } from "viem";
import { sepolia } from "viem/chains";

export const localhost = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true
});

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);

export const activeChain: Chain = chainId === sepolia.id ? sepolia : localhost;

export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? activeChain.rpcUrls.default.http[0];

function address(raw: string | undefined): Address {
  return raw && isAddress(raw) ? raw : "0x0000000000000000000000000000000000000000";
}

export const addresses = {
  registry: address(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS),
  credential: address(process.env.NEXT_PUBLIC_CREDENTIAL_ADDRESS),
  semaphore: address(process.env.NEXT_PUBLIC_SEMAPHORE_ADDRESS)
};

export const isConfigured =
  addresses.registry !== "0x0000000000000000000000000000000000000000" &&
  addresses.semaphore !== "0x0000000000000000000000000000000000000000";

export function publicClient() {
  return createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl, { timeout: 5_000, retryCount: 0 })
  });
}

import type { IdentityView } from "@/lib/types";

/** Creates a new random Semaphore identity in a serializable form. */
export async function createIdentity(label: string, personaId: string): Promise<IdentityView> {
  const { Identity } = await import("@semaphore-protocol/identity");
  const identity = new Identity();
  return {
    id: crypto.randomUUID(),
    label,
    privateKey: identity.export(),
    commitment: identity.commitment.toString(),
    personaId
  };
}

export function randomSalt(): bigint {
  return BigInt("0x" + crypto.randomUUID().replace(/-/g, ""));
}

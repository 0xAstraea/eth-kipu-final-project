import { describe, expect, it } from "vitest";
import { Identity } from "@semaphore-protocol/identity";
import { createIdentity, randomSalt } from "@/lib/identity";

describe("createIdentity", () => {
  it("exports an identity that imports back to the same commitment", async () => {
    const identity = await createIdentity("Test student", "alumn-1");

    expect(identity.label).toBe("Test student");
    expect(identity.personaId).toBe("alumn-1");
    expect(identity.id.length).toBeGreaterThan(0);
    expect(Identity.import(identity.privateKey).commitment.toString()).toBe(identity.commitment);
  });

  it("gives every identity a different commitment", async () => {
    const first = await createIdentity("One", "alumn-1");
    const second = await createIdentity("Two", "alumn-2");

    expect(first.commitment).not.toBe(second.commitment);
  });
});

describe("randomSalt", () => {
  it("returns a positive bigint", () => {
    const salt = randomSalt();

    expect(typeof salt).toBe("bigint");
    expect(salt > 0n).toBe(true);
  });

  it("does not repeat itself", () => {
    expect(randomSalt()).not.toBe(randomSalt());
  });
});

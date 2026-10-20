import { describe, expect, it } from "vitest";
import { claimCommitmentOf, joinMessageOf } from "@/lib/semaphore";

/** BN254 scalar field. Must match TeamRegistry.SNARK_FIELD_SIZE. */
const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Canonical values, pinned on both sides of the wire.
 * contracts/test/protocol-values.test.ts asserts the same constants with ethers.
 * If either implementation drifts, one of the two suites fails.
 */
const ADDRESS = "0x59F26b2b8cFaFC2b194B3b26cf0ba4dCa04a7537";
const SALT = 987654321n;
const PRESENTATION = "I know Solidity and Circom";
const EXPECTED_COMMITMENT = "0xd765317aea292e17ee31e8be8698e7c35d4467c9b4b97b51f8411a4a3e38558f";
const EXPECTED_MESSAGE = 1713359259607441103732988226112808846856377183313318768559976482957331920808n;

describe("claimCommitmentOf", () => {
  it("matches keccak256(abi.encode(address, salt))", () => {
    expect(claimCommitmentOf(ADDRESS, SALT)).toBe(EXPECTED_COMMITMENT);
  });

  it("changes when the address changes", () => {
    expect(claimCommitmentOf("0x0000000000000000000000000000000000000001", SALT)).not.toBe(
      EXPECTED_COMMITMENT
    );
  });

  it("changes when the salt changes", () => {
    expect(claimCommitmentOf(ADDRESS, SALT + 1n)).not.toBe(EXPECTED_COMMITMENT);
  });
});

describe("joinMessageOf", () => {
  it("matches the message the contract derives", () => {
    expect(joinMessageOf(PRESENTATION, EXPECTED_COMMITMENT)).toBe(EXPECTED_MESSAGE);
  });

  it("stays inside the SNARK field", () => {
    expect(joinMessageOf(PRESENTATION, EXPECTED_COMMITMENT)).toBeLessThan(SNARK_FIELD_SIZE);
  });

  it("changes when the presentation changes", () => {
    expect(joinMessageOf("another presentation", EXPECTED_COMMITMENT)).not.toBe(EXPECTED_MESSAGE);
  });

  it("changes when the commitment changes", () => {
    expect(joinMessageOf(PRESENTATION, claimCommitmentOf(ADDRESS, SALT + 1n))).not.toBe(
      EXPECTED_MESSAGE
    );
  });
});

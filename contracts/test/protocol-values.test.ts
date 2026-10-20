import { expect } from "chai";
import { claimCommitmentOf, joinMessageOf } from "./helpers/setup";

/**
 * Pins the values the frontend and the contract must agree on.
 * frontend/test/semaphore.test.ts asserts the same constants with viem. If either
 * implementation drifts, one of the two suites fails.
 */
const ADDRESS = "0x59F26b2b8cFaFC2b194B3b26cf0ba4dCa04a7537";
const SALT = 987654321n;
const PRESENTATION = "I know Solidity and Circom";
const EXPECTED_COMMITMENT = "0xd765317aea292e17ee31e8be8698e7c35d4467c9b4b97b51f8411a4a3e38558f";
const EXPECTED_MESSAGE = 1713359259607441103732988226112808846856377183313318768559976482957331920808n;

describe("protocol values", function () {
  it("derives the claim commitment the frontend expects", async function () {
    expect(claimCommitmentOf(ADDRESS, SALT)).to.equal(EXPECTED_COMMITMENT);
  });

  it("derives the join message the frontend expects", async function () {
    expect(joinMessageOf(PRESENTATION, EXPECTED_COMMITMENT)).to.equal(EXPECTED_MESSAGE);
  });
});

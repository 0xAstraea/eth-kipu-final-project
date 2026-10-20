# Slither static analysis report

- **Tool:** Slither `0.11.6` (installed with `uv tool install slither-analyzer`)
- **Build framework:** Hardhat 3 (auto-detected by `crytic-compile`)
- **Command:**

  ```bash
  slither . --filter-paths "node_modules|openzeppelin|semaphore|poseidon"
  ```

- **Scope:** project code only — `contracts/TeamRegistry.sol` and `contracts/TeamCredential.sol`.
  External dependencies (`@openzeppelin/contracts`, `@semaphore-protocol/contracts`,
  `poseidon-solidity`) are excluded from the analysis.
- **Raw output:** `slither-raw-output.txt` (not versioned; regenerate with the command above).
- **Import resolution note:** with pnpm, `crytic-compile` resolves the transitive package
  imports against `contracts/node_modules`. That is why `@zk-kit/lean-imt.sol` and
  `poseidon-solidity` are declared as dev dependencies of the contracts package: without them
  Slither cannot compile the Semaphore dependencies.
- **Last run:** 2026-10-20 — **33 contracts analyzed, 102 detectors, 3 findings**. All three
  are triaged below and all three are false positives.

## Summary

| # | Detector | Location | Verdict |
|---|----------|----------|---------|
| 1 | `reentrancy-no-eth` | `TeamRegistry.createTeam` (`contracts/TeamRegistry.sol:218-249`) | False positive (benign) |
| 2 | `reentrancy-no-eth` | `TeamRegistry.requestJoin` (`contracts/TeamRegistry.sol:261-290`) | False positive (benign) |
| 3 | `reentrancy-benign` | `TeamRegistry.createTeam` (`contracts/TeamRegistry.sol:218-249`) | False positive (benign) |

All three findings share a single root cause: state is written *after* an external call to
`semaphore.validateProof(courseGroupId, proof)`. The reasoning below is shared and then
specialised for each finding.

## Shared analysis: why `semaphore.validateProof` cannot be re-entered

1. **The call target is immutable and trusted.** `semaphore` is an `immutable` variable
   (`contracts/TeamRegistry.sol:27`) set once in the constructor to the deployed Semaphore (PSE)
   contract — an audited, widely used library. It is not a user-controlled or upgradeable
   destination, so an attacker cannot point the call at a malicious contract.
2. **The callee never calls back.** `Semaphore.validateProof` verifies the Groth16 proof against
   the group's Merkle root and marks the nullifier as used *in Semaphore's own storage*. It does
   not call `TeamRegistry`, and it does not forward control to any attacker-chosen address.
   Re-entrancy requires the callee to reach back into this contract; that path does not exist.
3. **Both functions are guarded.** `createTeam` and `requestJoin` carry `nonReentrant`
   (OpenZeppelin `ReentrancyGuardTransient`, EIP-1153). Slither's reentrancy detectors do not
   model a guard whose state lives in transient storage, so the protection is invisible to the
   detector. Even a hypothetical callback would be rejected.
4. **No value is transferred.** That is exactly why the detectors are named `*-no-eth` and
   `benign`: there is no ETH to steal, no balance to drain, and no exploitable window.
5. **A transaction is atomic.** No other transaction can interleave and observe the
   intermediate state. The only actor that could act on it is the callee, which never calls out.

## Finding 1 — `reentrancy-no-eth` in `createTeam`

**What Slither reports**

```
Reentrancy in TeamRegistry.createTeam(string,string,uint256,uint256,ISemaphore.SemaphoreProof)
(contracts/TeamRegistry.sol#218-249):
	External calls:
	- semaphore.validateProof(courseGroupId,proof) (contracts/TeamRegistry.sol#233)
	State variables written after the call(s):
	- teamCounter = teamId + 1 (contracts/TeamRegistry.sol#245)
	TeamRegistry.teamCounter (contracts/TeamRegistry.sol#59) can be used in cross function reentrancies:
	- TeamRegistry.nextTeamId() (contracts/TeamRegistry.sol#204-206)
	- TeamRegistry.teamCounter (contracts/TeamRegistry.sol#59)
```

**Why it is a false positive**

- The shared analysis above applies: the call target is a trusted `immutable` contract that never
  calls back, the function is `nonReentrant`, and no ETH moves.
- **The cross-function path Slither points at is read-only.** `nextTeamId()`
  (`contracts/TeamRegistry.sol:204-206`) is a `view` function that only returns `teamCounter`. It
  performs no state write and no external call, so it cannot be used to re-enter anything. The
  second "path" Slither lists is the `teamCounter` storage variable itself, which is a plain
  `uint256` with no behaviour attached.
- **The write cannot be hoisted before the call.** `teamCounter = teamId + 1` must happen after
  the proof is validated: incrementing the counter for a team whose creation would later revert
  would waste a team id and leave the counter inconsistent with the teams that exist. Validate
  first, then write — the current order is the safe one.
- **The team being created is not reachable until the function ends.** `teamId` is taken from
  `teamCounter` (`:228`) and the counter is incremented as the last step (`:245`), so no other
  party can address the new team before the transaction completes, and the whole body is atomic.

**Verdict:** false positive. Not exploitable; the write is intentional and correctly ordered.

## Finding 2 — `reentrancy-no-eth` in `requestJoin`

**What Slither reports**

```
Reentrancy in TeamRegistry.requestJoin(uint256,string,bytes32,ISemaphore.SemaphoreProof)
(contracts/TeamRegistry.sol#261-290):
	External calls:
	- semaphore.validateProof(courseGroupId,proof) (contracts/TeamRegistry.sol#283)
	State variables written after the call(s):
	- application.claimCommitment = claimCommitment (contracts/TeamRegistry.sol#287)
	TeamRegistry._applications (contracts/TeamRegistry.sol#65) can be used in cross function reentrancies:
	- TeamRegistry.acceptRequest(uint256,uint256) (contracts/TeamRegistry.sol#296-313)
	- TeamRegistry.getApplication(uint256,uint256) (contracts/TeamRegistry.sol#464-472)
```

**Why it is a false positive**

- The shared analysis above applies.
- **The cross-function paths cannot re-enter.**
  - `acceptRequest` (`:296-313`) makes **no external call** — it only writes
    `application.accepted` and pushes to `team.memberNullifiers` — and it is admin-gated
    (`msg.sender != team.admin` reverts with `NotTeamAdmin`). It therefore offers no re-entrancy
    path; it is listed only because it touches the same mapping.
  - `getApplication` (`:464-472`) is a `view` function: it only reads storage.
- **The written slot is guaranteed empty.** Before the external call, the function reverts with
  `ApplicationAlreadyExists` if `application.claimCommitment != 0` (`:275`). The value written at
  `:287` therefore always lands on a fresh, zeroed slot — there is no pre-existing state that a
  re-entrant call could corrupt.
- **A replay is impossible at the Semaphore layer.** `validateProof` burns the nullifier in
  Semaphore's storage, so any second call with the same proof would revert inside Semaphore with
  `Semaphore__YouAreUsingTheSameNullifierTwice` before reaching the write.
- **The write must follow the call.** The commitment can only be persisted for a proof that
  actually verified; writing it before validation would let anyone create applications with
  invalid proofs.

**Verdict:** false positive. Not exploitable.

## Finding 3 — `reentrancy-benign` in `createTeam`

**What Slither reports**

```
Reentrancy in TeamRegistry.createTeam(string,string,uint256,uint256,ISemaphore.SemaphoreProof)
(contracts/TeamRegistry.sol#218-249):
	External calls:
	- semaphore.validateProof(courseGroupId,proof) (contracts/TeamRegistry.sol#233)
	State variables written after the call(s):
	- team.admin = msg.sender (contracts/TeamRegistry.sol#236)
	- team.maxMembers = uint32(maxMembers) (contracts/TeamRegistry.sol#237)
	- team.revealAtBlock = uint64(revealAtBlock) (contracts/TeamRegistry.sol#238)
	- team.name = name (contracts/TeamRegistry.sol#239)
	- team.description = description (contracts/TeamRegistry.sol#240)
	- team.memberNullifiers.push(proof.nullifier) (contracts/TeamRegistry.sol#241)
```

**Why it is a false positive**

- The shared analysis above applies. The detector itself names the finding *benign*: it reports
  state writes after an external call in a function that moves no value.
- **Every write targets a brand-new struct.** `teamId` comes from `teamCounter` (`:228`) and the
  counter is incremented at the end of the function (`:245`), so the team id is not addressable by
  any other party until the transaction completes. The partially written struct is unobservable.
- **`memberNullifiers.push(proof.nullifier)` is the intended effect, not a corruption.** The
  creator is member #1 of the team they create, and the nullifier being pushed was already
  validated and burned by Semaphore inside `validateProof`, so it cannot be a duplicate.
- **No other party can act on the intermediate state** — the callee does not call out, and
  transactions cannot interleave.

**Verdict:** false positive. Not exploitable.

## What would change this assessment

These three findings are informational for the current design. They would need to be re-examined
if any of the following changed:

- the `semaphore` target became mutable, upgradeable, or user-controllable;
- ETH (or any value-bearing token) were transferred inside the affected functions;
- a callback were introduced on the path `Semaphore.validateProof` → `TeamRegistry`;
- the `nonReentrant` guard were removed from `createTeam` or `requestJoin`.

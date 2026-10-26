# Slither report

- **Tool:** Slither 0.11.6 (`uv tool install slither-analyzer`)
- **Framework:** Hardhat 3
- **Command:**

  ```bash
  slither . --filter-paths "node_modules|openzeppelin|semaphore|poseidon"
  ```

- **Scope:** `TeamRegistry.sol`, `TeamCredential.sol` (deps filtered out)
- **Raw output:** not versioned; regenerate with the command above
- **Note:** pnpm needs `@zk-kit/lean-imt.sol` and `poseidon-solidity` as root
  devDependencies so Slither can compile Semaphore imports
- **Last run:** 2026-10-25 — 43 contracts, 102 detectors, **3 findings** (all false positives)

## Summary

| # | Detector | Location | Verdict |
|---|----------|----------|---------|
| 1 | `reentrancy-no-eth` | `createTeam` | False positive |
| 2 | `reentrancy-no-eth` | `requestJoin` | False positive |
| 3 | `reentrancy-benign` | `createTeam` | False positive |

All three write state after `semaphore.validateProof(...)`.

## Shared reason (all three)

1. **Trusted immutable target.** `semaphore` is set once in the constructor. Not user-controlled.
2. **No callback.** `validateProof` verifies and burns the nullifier in Semaphore storage.
   It does not call back into `TeamRegistry`.
3. **Guarded.** Both functions use `nonReentrant` (`ReentrancyGuardTransient`).
   Slither does not model transient-storage guards.
4. **No value moved.** Detectors are `*-no-eth` / `benign`.
5. **Atomic tx.** No other tx can observe intermediate state.

## Finding 1 — `createTeam` / `reentrancy-no-eth`

Slither flags `teamCounter = teamId + 1` after `validateProof`.

- Shared reason applies.
- Cross-function path `nextTeamId()` is `view` only.
- Counter must rise only after a valid proof (else wasted / inconsistent ids).
- New `teamId` is not usable by others until the tx ends.

**Verdict:** false positive. Order is intentional.

## Finding 2 — `requestJoin` / `reentrancy-no-eth`

Slither flags `application.claimCommitment = ...` after `validateProof`.

- Shared reason applies.
- `acceptRequest` has no external call and is admin-gated.
- `getApplication` is `view`.
- Slot is empty before write (`ApplicationAlreadyExists` if not).
- Semaphore burns the nullifier; a replay reverts inside Semaphore.
- Commitment must be stored only after a valid proof.

**Verdict:** false positive.

## Finding 3 — `createTeam` / `reentrancy-benign`

Slither flags team field writes after `validateProof`.

- Shared reason applies. Detector name is *benign*.
- Writes target a new struct; id is not public until the tx ends.
- Pushing the creator nullifier is intended; Semaphore already burned it.

**Verdict:** false positive.

## Revisit if

- `semaphore` becomes mutable, upgradeable, or user-set
- ETH or tokens move in these functions
- A callback path `Semaphore → TeamRegistry` appears
- `nonReentrant` is removed from `createTeam` or `requestJoin`

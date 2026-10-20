# Gas cost analysis, TeamUp ZK

Every number below was measured on the Hardhat in-process network with solc 0.8.28 and
`optimizer.runs = 200`. The harness lives in `contracts/scripts/` and the raw reports in
`contracts/gas-snapshot.json`. Nothing in this document is estimated from reading the source.

The recommended changes are applied. The "applied" column is the current code, measured with
`bash scripts/gas-run.sh applied`.

Reproduce a number:

```bash
cd contracts
pnpm run gas
node scripts/gas-compare.mjs baseline applied
```
## 1. Baseline

Deployment, one time.

| Contract | Gas | Deployed bytes | Code deposit (200/byte) |
|---|---|---|---|
| SemaphoreVerifier | 3,716,011 | | |
| PoseidonT3 | 3,614,580 | | |
| Semaphore | 1,793,629 | | |
| TeamCredential | 1,323,952 | 5,412 | 1,082,400 (82%) |
| TeamRegistry | 1,524,566 | 6,234 | 1,246,800 (82%) |
| **Total** | **11,972,738** | | **2,329,200 of pure code deposit** |

Protocol flow, one team with one applicant.

| Call | Gas |
|---|---|
| createTeam | 500,973 |
| requestJoin | 327,501 |
| acceptRequest | 81,995 |
| reveal | 80,651 |
| claimCredential | 105,709 |
| **Flow total** | **1,096,829** |

Setup calls: `setRegistry` 47,386, `setCredential` 47,442, `addCourseMember` 127,133 to 164,750
per student.

Where the gas goes.

| Component | Gas | Share |
|---|---|---|
| ZK proof verification (`Semaphore.validateProof`) | 285,135 per proof | 60% of createTeam, 87% of requestJoin, 52% of the whole flow for two proofs |
| Team name and description in storage | 102,770 per team | 21% of createTeam |
| Roster array (length plus the creator nullifier) | 44,200 per team | 9% of createTeam |
| Code deposit at deploy | 2,329,200 | 82% of our two contracts |
| Application record (two slots) | 24,300 per applicant | 7% of requestJoin |
| ERC721 mint inside claimCredential | 82,864 | 78% of claimCredential |
| Reentrancy guard | 2,482 per guarded call plus 22,100 once | |

The proof verification is a floor. It is a bn254 pairing check plus the nullifier burn inside
Semaphore, and the protocol needs one proof per team creation and one per application.

## 2. Optimizations that pay off

Ranked by gas saved. Each row was measured as an isolated variant against the baseline.

### A. Reuse the Semaphore stack. Saves 9,124,220 at deploy, 76% of the deployment cost.

`SemaphoreVerifier` holds constants only and `PoseidonT3` is a pure library. Neither keeps
state, so both can be deployed once and pointed at forever. That is 7,330,591 gas.

The `Semaphore` contract keeps group state, but each `TeamRegistry` creates its own group in
its constructor, so one Semaphore serves many courses. That is another 1,793,629 gas.
Verified by the profiler. Two registries on one Semaphore got groups 0 and 1
and both created a team with a valid proof.

Caveat. The nullifier store is per group but the proof scope is the team id. Two courses with
identical rosters sharing one Semaphore could accept each other's proof for the same team id.
Reuse the verifier and the poseidon library unconditionally, and share the Semaphore contract
only when the rosters do not overlap.

No contract change. `deployments/<network>.json` already records the three addresses.

### B. Pack the Team struct into one storage slot. Saves 26,193 per createTeam and 24,200 per reveal.

`admin` (20 bytes), `maxMembers` (uint32) and `revealAtBlock` (uint64) fit in exactly 32 bytes.
Today each of them owns a slot, and a fresh slot costs 22,100.

Measured with the partial pack (`e1-repack`).

| Call | Baseline | Packed | Delta |
|---|---|---|---|
| createTeam | 500,973 | 474,780 | -26,193 (-5.2%) |
| createTeam with revealAtBlock set | 503,809 | 457,716 | -46,093 (-9.1%) |
| requestJoin | 327,501 | 325,549 | -1,952 |
| acceptRequest | 81,995 | 78,043 | -3,952 |
| reveal | 80,651 | 59,513 | -21,138 (-26.2%) |
| claimCredential | 105,709 | 103,737 | -1,972 |
| Flow total | 1,096,829 | 1,041,622 | -55,207 (-5.0%) |
| Deploy | 1,524,566 | 1,576,488 | +51,922 |

The deploy cost rises because the masking code grows the bytecode by 240 bytes. Break even
after the first team. The ABI does not change, `getTeam` still returns uint256. The existing
test suite passes 28 out of 28 with no edits.

Needs a range check on both fields. `maxMembers` above type(uint32).max and `revealAtBlock`
above type(uint64).max must revert instead of truncating.

### C. Derive the revealed flag from the roster root. Saves 20,000 per reveal.

`isRevealed` is redundant with `rosterRoot != 0`. The root is written exactly once, at reveal.
Removing the flag removes a boolean that has to stay in sync with another field, and it removes
an SSTORE.

Measured inside `e7-recommended`. `reveal` goes 80,651 to 56,451 (-30%).

### D. Transient reentrancy guard. Saves 1,992 per guarded call and 21,808 at deploy.

OpenZeppelin `ReentrancyGuard` writes a storage word. The guard status is 1 on entry and 2 while
entered, so the deployment pays 22,100 to initialize the slot and every call pays about 2,000.
`ReentrancyGuardTransient` keeps the same protection in transient storage for 200 gas.

Measured with `e2-transient-guard`: createTeam, requestJoin, claimCredential and
addCourseMember each drop 1,992, and the deploy drops 21,808. The chain already runs cancun, so
EIP-1153 is available.

Removing the guard instead (variant `e3-no-guard`) saves only 490 more per call and gives up
the protection. Keep the guard, make it transient.

### E. Credential registry as an immutable constructor argument. Saves 115,803 at deploy.

`TeamRegistry` is deployed first, so the credential can take the registry address in its
constructor and store it as `immutable`. The registry still learns the credential address
through `setCredential`, so there is no circular dependency. `setRegistry` disappears, and
`Ownable` on the credential disappears with it.

Measured with `e5-immutable-registry`.

| Item | Baseline | Variant | Delta |
|---|---|---|---|
| Deploy TeamCredential | 1,323,952 | 1,208,149 | -115,803 (-8.7%) |
| setRegistry call | 47,386 | gone | -47,386 |
| claimCredential | 105,709 | 103,631 | -2,078 |
| Bytecode | 5,412 | 4,990 | -422 bytes |

Migration. `setRegistry` is called from `deploy/deploy.ts`, `scripts/lib/protocol.ts`,
`test/helpers/setup.ts` and `test/TeamCredential.test.ts`, and it appears in the frontend ABI
and the generated typechain. Migrate those callers and delete `setRegistry` in the same wave.
With the contracts swapped and the helper untouched, 27 of the 28 tests pass and the only
failure is the setup helper calling a function that no longer exists.

### F. Drop redundant zero writes. Saves 2,224 per createTeam and per requestJoin.

`team.isRevealed = false` and `application.accepted = false` plus `application.claimed = false`
write zeros into slots that are already zero.

Measured with `e4-micro`: createTeam -2,224, requestJoin -2,224, 40 bytes smaller.

### G. Batch the course enrollment. Saves 214,491 for four students, 38%.

Semaphore exposes `addMembers(uint256[])`.

| Path | Four students | Per student |
|---|---|---|
| Four `addMember` calls | 568,086 | 142,021 |
| One `addMembers` call | 353,595 | 88,398 |

The registry now exposes `addCourseMembers(uint256[])` next to the single commitment
version. It costs 519 bytes of bytecode, which is 103,800 gas of code deposit, and it pays
back from the second student on.

### H. Compiler metadata off. Saves 11,435 per contract, nothing at runtime.

`metadata: { bytecodeHash: "none", appendCBOR: false }` removes 53 bytes of CBOR metadata, which
is 10,600 gas of code deposit per contract.

Measured with `c7-metadata-off`: deploy total -57,410, runtime gas unchanged to the gas.
Caveat. The deployed bytecode no longer carries the metadata hash, so block explorer
verification needs the same settings.

### I. Keep `optimizer.runs = 200`. Verified as the right setting, no change needed.

The deploy happens once and the flow repeats for every team, so a small runtime saving never
pays for a larger contract.

| Setting | Deploy | Flow total | Verdict |
|---|---|---|---|
| runs = 1 | -33,350 | +2,161 | worse |
| runs = 200 (current) | | | keep |
| runs = 1,000 | +332,334 | -182 | worse |
| runs = 100,000 | +2,625,869 | -538 | worse |

`viaIR` is not an option. The PoseidonT3 library exceeds the 24,576 byte code limit under viaIR
and the deployment fails, at any optimizer setting tried.

## 3. Rejected after measurement

| Idea | Result | Why |
|---|---|---|
| Derive `accepted` from the roster instead of storing a flag (`e6`) | acceptRequest -19,708, claimCredential +23,843, net +4,135 | The acceptance check becomes a scan and the cost lands on the claim. |
| Truncate the claim commitment to 30 bytes so the flags fit in the same slot | about -4,300 per applicant | The commitment slot is written anyway, so the saving is small, and the stored value the frontend shows would change. |
| Remove the reentrancy guard instead of making it transient | -490 more per call | Gives up the protection for a rounding error. |
| Raise the optimizer run count | up to +2,625,869 at deploy | The flow saving is at most 538. |
| Enable viaIR | deployment fails | PoseidonT3 exceeds the code size limit. |

## 4. Flagged, needs a product decision

These change what users see or what the protocol guarantees, so they are outside the
"no functionality change" boundary. Each one carries a measured number.

1. **Cap the description length in the UI.** The name and description cost 102,770 per team
   (102,770 measured as the difference between a createTeam with strings and one with empty
   strings). A 200 character description costs 96,205 more than a 63 character one. Capping at
   32 characters saves 22,100 per team and 132,600 at 200 characters. The contract keeps
   accepting any length, so this is a frontend change only.
2. **Move the name and description to event logs.** Saves about 100,000 per team creation, but
   `getTeam` would no longer return them and the frontend would have to read the logs.
3. **Replace OpenZeppelin ERC721 with a minimal soulbound token.** The credential deploys at
   1,323,952 gas, of which 1,082,400 is the code deposit for 5,412 bytes. A token around 2,500
   bytes would save roughly 580,000 at deploy. It changes the ABI, removing transfer and
   approval, and it drops a battle tested implementation.
4. **Shrink the TeamRegistry bytecode by hand.** Every 100 bytes of code costs 20,000 gas at
   deploy. The contract is 6,234 bytes, so a 500 byte reduction is 100,000 gas saved once. The
   SemaphoreProof struct encoding is the largest single block of generated code.
5. **Remove the `CredentialMinted` event.** About 1,900 gas per mint, but
   `frontend/components/team-card.tsx` listens for it.
6. **Use `_mint` instead of `_safeMint`.** Saves about 2,600 per mint, the extcodesize check,
   and it removes the ability of a recipient contract to refuse the credential.

## 5. Combined result

Applying A, B, C, D, E, F, G and H together. This is the code in the repository.

| Item | Baseline | After | Delta |
|---|---|---|---|
| Deploy, our two contracts | 2,848,518 | 2,832,401 | -16,117 |
| Deploy, full stack | 11,972,738 | 11,933,330 | -39,408 |
| Deploy, stack reused | 11,972,738 | 2,832,401 | -9,140,337 (-76%) |
| Flow, one team | 1,096,829 | 1,034,042 | -62,787 (-5.7%) |
| createTeam | 500,973 | 472,567 | -28,406 |
| requestJoin | 327,501 | 323,338 | -4,163 |
| acceptRequest | 81,995 | 80,048 | -1,947 |
| reveal | 80,651 | 56,473 | -24,178 |
| claimCredential | 105,709 | 101,616 | -4,093 |

The TeamRegistry bytecode grew from 6,234 to 6,857 bytes. The packing masks and the batch
enrollment function cost 103,800 gas of extra code deposit, which the flow savings repay
after two teams. The TeamCredential bytecode shrank from 5,412 to 4,936 bytes.

The full stack line moves by a few hundred gas between runs, because the cost of deploying
the third-party contracts depends on the bytes of their addresses, which the calldata
prices. The two contracts of this repo are stable.

## 6. Files

| Path | What it is |
|---|---|
| `contracts/scripts/gas-profile.ts` | The profiler. Deploys the stack, runs the flow, writes `gas-snapshot.json`. |
| `contracts/scripts/gas-compare.mjs` | Diffs two entries of the snapshot. |
| `contracts/scripts/gas-size.ts` | Deployed bytecode size of our two contracts. |
| `contracts/scripts/gas-run.sh` | Runs the profiler under a name. |
| `contracts/gas-snapshot.json` | The measured numbers, one entry per measurement. |

The `baseline` entry was measured against the code before these changes landed, so it can
only be reproduced by checking out the parent commit. The `applied` entry is the current
code.

Each change was measured as an isolated variant, by swapping one contract file at a time
and re-running the profiler. Those intermediate variants are not kept in the repository, and
the raw tool output is not versioned either. What stays in the repo is this document, the
snapshot, and the scripts that produce them.

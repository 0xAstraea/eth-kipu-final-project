# Gas cost analysis — TeamUp ZK

All numbers from Hardhat in-process, solc 0.8.28, `optimizer.runs = 200`.
Harness: `scripts/`. Raw data: `gas-snapshot.json`.
Current code = column **applied** (`bash scripts/gas-run.sh applied`).

```bash
pnpm run gas
node scripts/gas-compare.mjs baseline applied
```

## 1. Baseline

| Contract | Gas | Deployed bytes |
|---|---|---|
| SemaphoreVerifier | 3,716,011 | |
| PoseidonT3 | 3,614,580 | |
| Semaphore | 1,793,629 | |
| TeamCredential | 1,323,952 | 5,412 |
| TeamRegistry | 1,524,566 | 6,234 |
| **Total** | **11,972,738** | |

| Call | Gas |
|---|---|
| createTeam | 500,973 |
| requestJoin | 327,501 |
| acceptRequest | 81,995 |
| reveal | 80,651 |
| claimCredential | 105,709 |
| **Flow** | **1,096,829** |

| Hotspot | Gas | Share |
|---|---|---|
| `validateProof` | 285,135 / proof | ~52% of two-proof flow |
| Name + description storage | 102,770 / team | 21% of createTeam |
| Code deposit (our two) | 2,329,200 | 82% of their deploy |

Proof verification is a floor (bn254 + nullifier burn).

## 2. Applied optimizations

| # | Change | Saving |
|---|---|---|
| A | Reuse Semaphore stack | −9,124,220 deploy (76%) |
| B | Pack `admin`+`maxMembers`+`revealAtBlock` | −26,193 createTeam; −21k reveal |
| C | Revealed = `rosterRoot != 0` | −20,000 / reveal |
| D | `ReentrancyGuardTransient` | −1,992 / guarded call; −21,808 deploy |
| E | Credential `registry` immutable | −115,803 deploy credential |
| F | Drop redundant zero writes | −2,224 createTeam / requestJoin |
| G | `addCourseMembers` batch | −38% for four students |
| H | Compiler metadata off | −11,435 / contract deploy (**reverted** — blocked explorer verify / HHE80005) |
| I | Keep `runs = 200` | verified best; `viaIR` fails (Poseidon size) |

**A caveat:** share one Semaphore only if course rosters do not overlap
(same team id + same roster could cross-accept proofs). Always reuse verifier + Poseidon.

**B caveat:** revert if `maxMembers` > uint32 max or `revealAtBlock` > uint64 max.

## 3. Rejected

| Idea | Result |
|---|---|
| Derive `accepted` from roster | Net +4,135 (claim gets more expensive) |
| Truncate claim commitment to 30 bytes | ~−4,300; changes shown value |
| Remove reentrancy guard | −490 more; loses protection |
| Higher `optimizer.runs` | Deploy cost rises a lot |
| `viaIR` | Deploy fails (PoseidonT3 > code limit) |

## 4. Product decisions (not applied)

| Idea | Approx. saving | Cost |
|---|---|---|
| Cap description in UI | up to 132,600 / team | UX only |
| Name/desc in events only | ~100,000 / create | Breaks `getTeam` |
| Minimal soulbound vs OZ ERC721 | ~580,000 deploy | New ABI; less battle-tested |
| Hand-shrink Registry bytecode | 20,000 / 100 bytes | Effort |
| Drop mint event | ~1,900 / mint | Frontend listens |
| `_mint` vs `_safeMint` | ~2,600 / mint | No reject-on-receive |

## 5. Combined result (current code)

| Item | Baseline | After | Delta |
|---|---|---|---|
| Deploy (our two) | 2,848,518 | 2,832,401 | −16,117 |
| Deploy (full stack) | 11,972,738 | 11,933,330 | −39,408 |
| Deploy (stack reused) | 11,972,738 | 2,832,401 | −9,140,337 (−76%) |
| Flow (one team) | 1,096,829 | 1,034,042 | −62,787 (−5.7%) |
| createTeam | 500,973 | 472,567 | −28,406 |
| requestJoin | 327,501 | 323,338 | −4,163 |
| acceptRequest | 81,995 | 80,048 | −1,947 |
| reveal | 80,651 | 56,473 | −24,178 |
| claimCredential | 105,709 | 101,616 | −4,093 |

Registry bytecode 6,234 → 6,857. Credential 5,412 → 4,936.
Extra code deposit pays back after about two teams.

## 6. Files

| Path | Role |
|---|---|
| `scripts/gas-profile.ts` | Profile → `gas-snapshot.json` |
| `scripts/gas-compare.mjs` | Diff two snapshot entries |
| `scripts/gas-size.ts` | Deployed bytecode size |
| `scripts/gas-run.sh` | Named profile run |
| `gas-snapshot.json` | Measured numbers |

`baseline` needs the pre-change commit. `applied` is current code.

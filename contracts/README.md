# TeamUp ZK — Contracts

On-chain team formation with Semaphore ZK membership proofs.
Students apply by **nullifier**, not by address, and claim an **NFT credential**.

Product analysis and threat model: [`../WHITEPAPER.md`](../WHITEPAPER.md).
UI: [`../frontend`](../frontend).

## Architecture

```
Course Owner (Ownable)
        │ addCourseMember(s)
        ▼
Semaphore (PSE)  ──validateProof──►  TeamRegistry  ──mint──►  TeamCredential (ERC721)
```

| Contract | Role |
|---|---|
| `Semaphore` | Course group + proof verification |
| `TeamRegistry` | Teams, applications, reveal, claim |
| `TeamCredential` | Membership NFT |

`TeamRegistry` calls `ISemaphore`. It does not inherit `Semaphore`
(public `addMember` would bypass the teacher).

## Main flow

| # | Who | Call | Result |
|---|---|---|---|
| 1 | Teacher | `addCourseMember(s)` | Student in course group |
| 2 | Member | `createTeam(..., proof)` | Team created (ZK membership) |
| 3 | Member | `requestJoin(..., proof)` | Application keyed by nullifier |
| 4 | Non-member | `requestJoin` | Revert |
| 5 | Team admin | `acceptRequest(teamId, nullifier)` | Member added |
| 6 | Anyone | `reveal(teamId)` | Roster frozen + `rosterRoot` |
| 7 | Anyone (gas) | `claimCredential(...)` | NFT to committed address |

Applications never store `msg.sender`. Only `claimCommitment`, `accepted`, `claimed`.

## Install, test, Slither

```bash
pnpm install                 # from repo root
pnpm run compile
pnpm --filter @teamup/contracts test
pnpm test                    # full repo: 62 tests
pnpm run coverage            # 100% lines/statements on own code
```

```bash
uv tool install slither-analyzer
slither . --filter-paths "node_modules|openzeppelin|semaphore|poseidon"
```

Triage: [`security/slither-report.md`](security/slither-report.md)
(last run: 3 findings, all false positives).

```bash
pnpm run demo                # narrated local flow
```

## Layout

```
contracts/   TeamRegistry.sol, TeamCredential.sol, interfaces/
test/        Mocha suite + ZK helpers
deploy/      deploy.ts, interact.ts, semaphore-stack.json
scripts/     demo, gas tools, ABI/env sync
security/    slither-report.md
```

## Deploy (Sepolia)

Full steps: [`deploy/README.md`](deploy/README.md).

```bash
cp .env.example .env         # SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY
pnpm run deploy:sepolia
pnpm run verify:sepolia
pnpm run interact:sepolia
```

## Network and addresses

> _Fill after Sepolia deploy._

| Contract | Address | Verified code |
|---|---|---|
| TeamRegistry | `0x…` | [Sepolia](https://sepolia.etherscan.io/address/0x…) |
| TeamCredential | `0x…` | [Sepolia](https://sepolia.etherscan.io/address/0x…) |
| Semaphore | `0x…` | [Sepolia](https://sepolia.etherscan.io/address/0x…) |
| SemaphoreVerifier | `0x…` | [Sepolia](https://sepolia.etherscan.io/address/0x…) |
| PoseidonT3 | `0x…` | [Sepolia](https://sepolia.etherscan.io/address/0x…) |

## On-chain evidence

> _Paste hashes from `interact.ts`._

| Step | Tx |
|---|---|
| addCourseMembers | `0x…` |
| createTeam | `0x…` |
| requestJoin | `0x…` |
| acceptRequest | `0x…` |
| reveal | `0x…` |
| claimCredential | `0x…` |

## Gas (summary)

Details: [`GAS-OPTIMIZATION-REPORT.md`](GAS-OPTIMIZATION-REPORT.md).

| Item | Before | After |
|---|---|---|
| Full stack deploy | 11,972,738 | 2,832,401 (reuse Semaphore) |
| One-team flow (5 txs) | 1,096,829 | 1,034,042 |

## Design notes

- Reveal clock = `block.number` (not timestamp).
- Membership = ZK proof, not ECDSA.
- Claim = keccak commit-reveal (not experimental Semaphore ownership circuit).
- `reveal` is permissionless when the condition holds; claims require revealed teams.

## Limits

1. Small groups (1–2) are not anonymous.
2. Tx sender is public without a relayer.
3. Mempool proof copy can burn a nullifier (private relays in production).

## Roadmap

| # | Item |
|---|---|
| 1 | Staking + slashing |
| 2 | Relayer |
| 3 | Blind recruit (stable ownership circuit) |
| 4 | Cumulative reputation |
| 5 | Off-chain matching (subgraph) |
| 6 | ~~Web UI~~ — done (`../frontend`) |

## Security checklist

- Nullifier burn via `validateProof`
- Proof message binds presentation + claim commitment
- CEI + `ReentrancyGuardTransient`
- Custom errors + events
- OZ Ownable / ERC721 / transient guard

# TeamUp ZK

On-chain team formation for a course. Students prove course membership with a
**Semaphore V4 zero-knowledge proof** and apply **without revealing who they are**.
The contract stores a **nullifier**, not an address. Accepted members claim an **NFT credential**.

A shared spreadsheet does not verify membership, does not stop double applications,
and does not leave a public record. A central server can only *promise* anonymity.
This protocol puts the rules in a contract so anyone can *verify* them.
See [`WHITEPAPER.md`](WHITEPAPER.md) §2.

## Layout

| Path | Content |
|---|---|
| `contracts/` | Solidity protocol, Hardhat tests, deploy, Slither |
| `frontend/` | Next.js 16 + wagmi 3, ZK proofs in the browser |
| `WHITEPAPER.md` | Problem, design, limits, roadmap |

Install and test both packages from the root (pnpm workspace).

## Quick start

```bash
pnpm install
pnpm test             # 62 tests (46 contracts + 16 frontend)
pnpm run check        # typecheck + lint + tests
pnpm run build
```

```bash
cd frontend
cp .env.example .env.local
pnpm run dev          # http://localhost:3000
```

## Local demo (for the video)

```bash
# terminal 1
pnpm run node

# terminal 2
pnpm run deploy:localhost
pnpm run interact:localhost
pnpm run export:abis
pnpm run sync:frontend-env

# terminal 3
cd frontend && pnpm run dev
```

Connect MetaMask to `localhost:31337`. Use two browser profiles for owner and student.
Details: [`contracts/deploy/README.md`](contracts/deploy/README.md).

## Delivery map

| Requirement | Where |
|---|---|
| Deployed + verified contracts | [`contracts/README.md`](contracts/README.md) (fill after Sepolia deploy) |
| On-chain flow tx hashes | same → "On-chain evidence" |
| NatSpec, custom errors, CEI, events | `contracts/contracts/*.sol` |
| Gas packing, immutable, unchecked | `TeamRegistry.sol`, `TeamCredential.sol` |
| Tests + coverage > 40% | `pnpm test`, `pnpm run coverage` (100% lines/statements) |
| Slither triage | [`contracts/security/slither-report.md`](contracts/security/slither-report.md) |
| Frontend | `frontend/` |
| Limits + roadmap | [`WHITEPAPER.md`](WHITEPAPER.md) |

**You still must do:** Sepolia deploy, explorer verification, paste tx hashes, public repo,
one commit per teammate, video ≤ 5 min.

## Flow (one line)

Owner enrolls commitments → member creates a team or applies with a ZK proof →
team accepts by nullifier → after `reveal`, member claims the NFT to any address.

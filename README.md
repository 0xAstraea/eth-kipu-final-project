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

Needs Node 20+, [pnpm](https://pnpm.io), and [GNU Make](https://www.gnu.org/software/make/).
On Windows, use Git Bash or WSL, or install Make (`choco install make`).

```bash
make setup            # pnpm install + create .env files from examples
make test             # 62 tests (contracts + frontend)
make check            # typecheck + lint + tests
make build
make help             # all targets
```

```bash
make frontend         # http://localhost:3000
```

### Testnet (Sepolia)

```bash
make setup            # then edit contracts/.env
make testnet          # deploy + verify + interact
```

Or step by step: `make deploy`, `make verify`, `make interact`.

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

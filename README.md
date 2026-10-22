# TeamUp ZK

On-chain team formation for a course. Students prove course membership with a
**Semaphore V4 zero-knowledge proof** and apply **without revealing who they are**.
The contract stores a **nullifier**, not an address. Accepted members claim an **NFT credential**.

A shared spreadsheet does not verify membership, stop double applications, or leave a
public record. A central server can only *promise* anonymity. This protocol puts the rules
in a contract so anyone can *verify* them. Design and threat model: [`WHITEPAPER.md`](WHITEPAPER.md).

**Flow:** owner enrolls commitments → member creates a team or applies with a ZK proof →
team accepts by nullifier → after `reveal`, member claims the NFT to any address.

## Repository

| Path | Content |
|---|---|
| `contracts/` | Solidity (`TeamRegistry`, `TeamCredential`), Hardhat tests, deploy, Slither |
| `frontend/` | Next.js 16 + wagmi 3; ZK proofs in the browser |
| `WHITEPAPER.md` | Problem, architecture, limits, roadmap |
| `contracts/deployed.md` | Sepolia addresses, verified code, on-chain evidence |

## Sepolia

| Contract | Address | Verified code |
|---|---|---|
| TeamRegistry | `0x13B68Fb542359569f626D12F51b2d43cA5044BEC` | [Etherscan](https://sepolia.etherscan.io/address/0x13B68Fb542359569f626D12F51b2d43cA5044BEC#code) |
| TeamCredential | `0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5` | [Etherscan](https://sepolia.etherscan.io/address/0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5#code) |
| Semaphore | `0xBB10e761CDB2dEf868476c427BD168bF6699C691` | [Etherscan](https://sepolia.etherscan.io/address/0xBB10e761CDB2dEf868476c427BD168bF6699C691#code) |
| SemaphoreVerifier | `0x1eE051c06323d8E28bDebe98a32F1356C4d2cC5a` | [Etherscan](https://sepolia.etherscan.io/address/0x1eE051c06323d8E28bDebe98a32F1356C4d2cC5a#code) |
| PoseidonT3 | `0x8F53de417555496B1b288ba20f1dCEF76a4a8c4B` | [Etherscan](https://sepolia.etherscan.io/address/0x8F53de417555496B1b288ba20f1dCEF76a4a8c4B#code) |

Evidence txs: [`contracts/deployed.md`](contracts/deployed.md).

## Build and test

Requires Node 20+, [pnpm](https://pnpm.io), and optionally [GNU Make](https://www.gnu.org/software/make/).

```bash
make setup            # or: pnpm install
make test             # 62 tests (46 contracts + 16 frontend)
make coverage         # 100% lines/statements on own Solidity
make slither          # triage in contracts/security/slither-report.md
make build
make frontend         # http://localhost:3000
```

`make help` lists all targets. Contract details: [`contracts/README.md`](contracts/README.md).
Frontend: [`frontend/README.md`](frontend/README.md).

## Local run

```bash
make node             # terminal 1 — local chain
make deploy-local && make interact-local && make sync   # terminal 2
make frontend         # terminal 3 — MetaMask on localhost:31337
```

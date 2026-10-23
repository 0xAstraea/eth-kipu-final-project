# TeamUp ZK

**Anonymous team formation on Ethereum** — students prove course membership with a
[Semaphore](https://semaphore.pse.dev) V4 zero-knowledge proof and apply **without
revealing who they are**. Applications are keyed by a **nullifier**, not a wallet.
Accepted members claim an **NFT credential** (`TeamCredential`) to any address.

| | |
|---|---|
| Network | [Sepolia](https://sepolia.etherscan.io) |
| Status | Contracts verified · full flow executed on-chain |
| Design | [`WHITEPAPER.md`](WHITEPAPER.md) |

A shared spreadsheet does not verify membership, stop double applications, or leave a
public record. A server can only *promise* anonymity. This protocol puts the rules in a
contract so anyone can *verify* them.

### Protocol flow

```text
Owner enrolls commitments
        │
        ▼
Member creates a team  ──or──  applies with a ZK proof
        │                            │
        └──────── accept by nullifier ┘
                     │
                     ▼
              reveal roster
                     │
                     ▼
         claim NFT → any address
```

---

## Sepolia deployment

Deployer: [`0x01BE2966…57aeA`](https://sepolia.etherscan.io/address/0x01BE2966b319F9A4177db48cc8cd101922a57aeA) · course group `1`

### Contracts

| Contract | Address | Code |
|---|---|---|
| **TeamRegistry** | [`0x13B68Fb5…044BEC`](https://sepolia.etherscan.io/address/0x13B68Fb542359569f626D12F51b2d43cA5044BEC) | [verified](https://sepolia.etherscan.io/address/0x13B68Fb542359569f626D12F51b2d43cA5044BEC#code) |
| **TeamCredential** (NFT) | [`0x403FB7c8…2261F5`](https://sepolia.etherscan.io/address/0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5) | [verified](https://sepolia.etherscan.io/address/0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5#code) |
| Semaphore | [`0xBB10e761…69C691`](https://sepolia.etherscan.io/address/0xBB10e761CDB2dEf868476c427BD168bF6699C691) | [verified](https://sepolia.etherscan.io/address/0xBB10e761CDB2dEf868476c427BD168bF6699C691#code) |
| SemaphoreVerifier | [`0x1eE051c0…d2cC5a`](https://sepolia.etherscan.io/address/0x1eE051c06323d8E28bDebe98a32F1356C4d2cC5a) | [verified](https://sepolia.etherscan.io/address/0x1eE051c06323d8E28bDebe98a32F1356C4d2cC5a#code) |
| PoseidonT3 | [`0x8F53de41…a8c4B`](https://sepolia.etherscan.io/address/0x8F53de417555496B1b288ba20f1dCEF76a4a8c4B) | [verified](https://sepolia.etherscan.io/address/0x8F53de417555496B1b288ba20f1dCEF76a4a8c4B#code) |

Check NFT ownership on `TeamCredential` → Read contract → `ownerOf(tokenId)`
(e.g. `1`, `2`).

### On-chain evidence — Team #0

| Step | Transaction |
|---|---|
| Enroll members | [tx](https://sepolia.etherscan.io/tx/0x90d063d0bf424bbd1ce6f52524e7707e4ed392b166d61a4025735bbe47f738f4) |
| Create team | [tx](https://sepolia.etherscan.io/tx/0x7ff3ad2fd31615ea45581edd88572c4d4a73395b8873d4fba3d59b93d65ad48e) |
| Bob applies | [tx](https://sepolia.etherscan.io/tx/0x9f02c4c49bbbfa56ee239e074c99a6bf0e808d627fa6a173f494803644c8e381) |
| Accept Bob | [tx](https://sepolia.etherscan.io/tx/0xe4e06e63ac1b4f4465d4a2ebad55ff1a4461d0908db3118b030a8f6906c392ea) |
| Charlie applies | [tx](https://sepolia.etherscan.io/tx/0xd2c2aa92c290542cc45a98b583eb75757a2297e8fa6d9e387d6d4179c7e69e77) |
| Accept Charlie | [tx](https://sepolia.etherscan.io/tx/0xd87993c6c0c40f325dfe338278f991111770951643c80ac9cf41bd7b0544d384) |
| Reveal roster | [tx](https://sepolia.etherscan.io/tx/0xae697fa823df12754c8c63f04e65d72eba33bfaff8eb57c83c844f8110cda68d) |
| Bob claims NFT → [`0xD49E…8Ae8`](https://sepolia.etherscan.io/address/0xD49E2E181ED2d76B280E21d6F7CD8e4162358Ae8) | [tx](https://sepolia.etherscan.io/tx/0xabdd53c0c0f6af9610ab4643cf97b758fa01244ad5e65d527aa56388bd6c4f73) |
| Charlie claims NFT → [`0xeA48…F06E`](https://sepolia.etherscan.io/address/0xeA487ed36C155695C765D3e7DC9201c0b3f1F06E) | [tx](https://sepolia.etherscan.io/tx/0xa934b28898664f23f4144830942b58f9b44246b446649c2caff40c392b1563d6) |

`rosterRoot` after reveal: `0xe803f6166e028d6a47d99daea2db12b34fe92693b5817f793108320dad57c2ac`

Full copy (same data): [`contracts/deployed.md`](contracts/deployed.md).

---

## Repository

| Path | Role |
|---|---|
| [`contracts/`](contracts/) | `TeamRegistry`, `TeamCredential`, Hardhat tests, Slither, deploy |
| [`frontend/`](frontend/) | Next.js 16 + wagmi 3 · ZK proofs in the browser |
| [`WHITEPAPER.md`](WHITEPAPER.md) | Problem, threat model, crypto, roadmap |

## Build and test

Node 20+, [pnpm](https://pnpm.io), optional [GNU Make](https://www.gnu.org/software/make/).

```bash
make setup            # pnpm install + .env examples
make test             # 62 tests (46 contracts + 16 frontend)
make coverage         # 100% lines/statements on own Solidity
make slither          # → contracts/security/slither-report.md
make build
make frontend         # http://localhost:3000
```

```bash
make help             # all targets
```

More detail: [`contracts/README.md`](contracts/README.md) · [`frontend/README.md`](frontend/README.md).

## Local demo

```bash
make node                                                    # terminal 1
make deploy-local && make interact-local && make sync        # terminal 2
make frontend                                                # terminal 3 — MetaMask → localhost:31337
```

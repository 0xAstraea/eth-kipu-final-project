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

### On-chain evidence — Team #1

| Step | Transaction |
|---|---|
| Enroll members | [tx](https://sepolia.etherscan.io/tx/0xdbce8248b0984abde2d501fc9ae2dd5d3a71cd8c27398d969561ce6fdc23162b) |
| Create team | [tx](https://sepolia.etherscan.io/tx/0xc83d80e0172ceb485995403a2eaaefa611d94c8f261653c802169b820ad86534) |
| Bob applies | [tx](https://sepolia.etherscan.io/tx/0x1ef50695dc2b010ff3b7c66ffe04062b1fa3c752ea7ceabb1405f944d2d5fda3) |
| Accept Bob | [tx](https://sepolia.etherscan.io/tx/0x5dd69a7427f0f0c0379c17afed8e1ba3327597e4d56386f0e95ea308419cd457) |
| Charlie applies | [tx](https://sepolia.etherscan.io/tx/0x87b9a58be1085a1ed5d2adebc5b76281b9047cee83e9f6845d66d5f66f2ac00f) |
| Accept Charlie | [tx](https://sepolia.etherscan.io/tx/0x15cbc82070ce12e5341ce26a7195603f93de07648a62012413c3479da1c59823) |
| Reveal roster | [tx](https://sepolia.etherscan.io/tx/0x1717cf7a24d4768fcd01073529944c6ac2f3166ff81ccb9eb80c2409c6225d48) |
| Bob claims NFT → [`0xD49E…8Ae8`](https://sepolia.etherscan.io/address/0xDf409B20C5C78a941fD3F42F44Ffba9c36D5D622) | [tx](https://sepolia.etherscan.io/tx/0x79d9d24a569008ba368c4616f925c2731ec953e7d1820acb195f7d7586cc45de) |
| Charlie claims NFT → [`0xeA48…F06E`](https://sepolia.etherscan.io/address/0xeB32ACd8254D017256717E2ca2762D392F77c648) | [tx](https://sepolia.etherscan.io/tx/0xcafb93a6945ce5ed76d1a453cf82b6200f6a64784ff9be7a394f5b545858747e) |

`rosterRoot` after reveal: `0x8d0d797cbde00614745127d232ccc451c2d88ff6ec2b2bb3e2a294f6266bd73c`

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

### Sepolia showcase (for the demo video)

Each step of the on-chain flow has its own script and make target

```bash
make sepolia              # all steps in order
make sepolia-contracts    # contract addresses (verified on Etherscan)
make sepolia-enroll       # step 1: enroll members
make sepolia-create       # step 2: create team
make sepolia-apply-bob    # step 3: Bob applies
make sepolia-accept-bob   # step 4: accept Bob
make sepolia-apply-charlie # step 5: Charlie applies
make sepolia-accept-charlie # step 6: accept Charlie
make sepolia-reveal       # step 7: reveal roster
make sepolia-claim-bob    # step 8: Bob claims NFT
make sepolia-claim-charlie # step 9: Charlie claims NFT
make sepolia-nft          # verify NFT ownership (ownerOf(1), ownerOf(2))
```

Each target prints the transaction hash and the Etherscan link for that step.

More detail: [`contracts/README.md`](contracts/README.md) · [`frontend/README.md`](frontend/README.md).

## Local demo

```bash
make node                                                    # terminal 1
make deploy-local && make interact-local && make sync        # terminal 2
make frontend                                                # terminal 3 — MetaMask → localhost:31337
```

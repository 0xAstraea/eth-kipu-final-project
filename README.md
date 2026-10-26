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

Full copy (same data): [`deployed.md`](deployed.md).

---

## Architecture

| Contract | Role |
|---|---|
| `Semaphore` (PSE, external) | Course group + ZK membership verification |
| `TeamRegistry` (ours) | Course enrollment, teams, applications, reveal, claim |
| `TeamCredential` (ours, ERC-721) | Membership NFT, minted only by the registry |

`TeamRegistry` calls `ISemaphore` instead of inheriting it, so the public
`addMember` cannot bypass the course owner. The registry mints through
`ITeamCredential`; the credential accepts only its immutable registry.
The teacher owns the course group; applications are stored by nullifier, never
by `msg.sender`.

Contract-to-contract interactions: `TeamRegistry` → `Semaphore` (`createGroup`,
`addMember(s)`, `validateProof`) and `TeamRegistry` → `TeamCredential` (`mint`).

## Repository

| Path | Role |
|---|---|
| [`contracts/`](contracts/) | Solidity source (`TeamRegistry`, `TeamCredential`, interface) |
| [`test/`](test/) | Hardhat + Mocha unit tests and ZK helpers |
| [`deploy/`](deploy/) | Deploy, verify and on-chain interaction scripts |
| [`scripts/`](scripts/) | Demo, gas tools, ABI and frontend-env sync |
| [`security/`](security/) | Slither report and findings triage |
| [`frontend/`](frontend/) | Next.js 16 + wagmi 3 · ZK proofs in the browser |
| [`WHITEPAPER.md`](WHITEPAPER.md) | Problem, threat model, crypto, roadmap |
| [`CONTRACTS.md`](CONTRACTS.md) | Contract-level architecture and design notes |

## Install, compile and test

Requirements: Node 20+, [pnpm](https://pnpm.io), optional
[GNU Make](https://www.gnu.org/software/make/). Copy `.env.example` to `.env`
before deploying to Sepolia; tests and local demos do not need it.

```bash
pnpm install              # or: make setup (install + .env files)
pnpm run compile          # or: make compile

pnpm test                 # 62 tests (46 contracts + 16 frontend)
pnpm run test:contracts   # contract suite only
pnpm run coverage         # 100% lines/statements on own Solidity
pnpm run typecheck
pnpm run lint
```

Static analysis (Slither 0.11.6):

```bash
uv tool install slither-analyzer
slither . --filter-paths "node_modules|openzeppelin|semaphore|poseidon"
```

Triage and accepted findings: [`security/slither-report.md`](security/slither-report.md).

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
The recorded run is linked at the end: [Video demo evidence](#video-demo-evidence-make-sepolia).

More detail: [`CONTRACTS.md`](CONTRACTS.md) · [`deploy/README.md`](deploy/README.md) · [`frontend/README.md`](frontend/README.md).

## Local demo

```bash
make node                                                    # terminal 1
make deploy-local && make interact-local && make sync        # terminal 2
make frontend                                                # terminal 3 — MetaMask → localhost:31337
```

Or with pnpm directly:

```bash
pnpm run node
pnpm run deploy:localhost
pnpm run interact:localhost
pnpm run sync:frontend-env
pnpm run dev
```

The frontend needs an injected wallet (e.g. MetaMask) on chain `31337`
(localhost) or `11155111` (Sepolia). Enroll students as the course owner, create
or join a team with an in-browser Semaphore proof, accept by nullifier, reveal,
and claim the NFT.

## Known MVP limitations

1. **Statistical anonymity.** Teams of 1–2 members are not anonymous

   (Semaphore documentation).
2. **Transaction sender is public.** A relayer is required to hide `msg.sender`

   at the network level; the contract itself never stores it.
3. **Mempool griefing.** Copying a proof can burn the victim's nullifier.

   Production deployments should use private relays.
4. **No economic incentives.** There is no stake or slashing for abandoning a

   team.
5. **No off-chain discovery.** Team search, skills matching and chat remain

   outside the MVP.

## Roadmap

| Phase | Item | Why |
|---|---|---|
| 2 | Staking / slashing | Cost for abandoning a team |
| 2 | Relayer | Hide the sender and prevent mempool griefing |
| 3 | Blind recruit | Accept by nullifier; reveal at claim |
| 3 | Cumulative reputation | Participation credentials without public scores |
| 4 | Off-chain matching | Skills and roles through a subgraph |
| done | Web UI | Delivered in [`frontend/`](frontend/) |

---

## Video demo evidence (make sepolia)

The `make sepolia` output prints the addresses and transaction links below. (Repeated as deployed section above, just for clarity sake) They are repeated here so the video evidence stays clickable.  


Network: **Sepolia** (chainId `11155111`)  
Deployer / course owner:
[`0x01BE2966b319F9A4177db48cc8cd101922a57aeA`](https://sepolia.etherscan.io/address/0x01BE2966b319F9A4177db48cc8cd101922a57aeA)  
Course group id: `1`  
`rosterRoot` after reveal: `0x8d0d797cbde00614745127d232ccc451c2d88ff6ec2b2bb3e2a294f6266bd73c`

| Contract | Address | Verified code |
|---|---|---|
| **TeamRegistry** | `0x13B68Fb542359569f626D12F51b2d43cA5044BEC` | [Etherscan](https://sepolia.etherscan.io/address/0x13B68Fb542359569f626D12F51b2d43cA5044BEC#code) |
| **TeamCredential** | `0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5` | [Etherscan](https://sepolia.etherscan.io/address/0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5#code) |
| Semaphore | `0xBB10e761CDB2dEf868476c427BD168bF6699C691` | [Etherscan](https://sepolia.etherscan.io/address/0xBB10e761CDB2dEf868476c427BD168bF6699C691#code) |
| SemaphoreVerifier | `0x1eE051c06323d8E28bDebe98a32F1356C4d2cC5a` | [Etherscan](https://sepolia.etherscan.io/address/0x1eE051c06323d8E28bDebe98a32F1356C4d2cC5a#code) |
| PoseidonT3 | `0x8F53de417555496B1b288ba20f1dCEF76a4a8c4B` | [Etherscan](https://sepolia.etherscan.io/address/0x8F53de417555496B1b288ba20f1dCEF76a4a8c4B#code) |

| Step | Command | Transaction | Result |
|---|---|---|---|
| 1 | `make sepolia-enroll` | [`0xdbce8248…162b`](https://sepolia.etherscan.io/tx/0xdbce8248b0984abde2d501fc9ae2dd5d3a71cd8c27398d969561ce6fdc23162b) | Members enrolled |
| 2 | `make sepolia-create` | [`0xc83d80e0…6534`](https://sepolia.etherscan.io/tx/0xc83d80e0172ceb485995403a2eaaefa611d94c8f261653c802169b820ad86534) | Team #1 created |
| 3 | `make sepolia-apply-bob` | [`0x1ef50695…fda3`](https://sepolia.etherscan.io/tx/0x1ef50695dc2b010ff3b7c66ffe04062b1fa3c752ea7ceabb1405f944d2d5fda3) | Bob applies by nullifier |
| 4 | `make sepolia-accept-bob` | [`0x5dd69a74…d457`](https://sepolia.etherscan.io/tx/0x5dd69a7427f0f0c0379c17afed8e1ba3327597e4d56386f0e95ea308419cd457) | Bob accepted |
| 5 | `make sepolia-apply-charlie` | [`0x87b9a58b…c00f`](https://sepolia.etherscan.io/tx/0x87b9a58be1085a1ed5d2adebc5b76281b9047cee83e9f6845d66d5f66f2ac00f) | Charlie applies by nullifier |
| 6 | `make sepolia-accept-charlie` | [`0x15cbc820…9823`](https://sepolia.etherscan.io/tx/0x15cbc82070ce12e5341ce26a7195603f93de07648a62012413c3479da1c59823) | Charlie accepted |
| 7 | `make sepolia-reveal` | [`0x1717cf7a…5d48`](https://sepolia.etherscan.io/tx/0x1717cf7a24d4768fcd01073529944c6ac2f3166ff81ccb9eb80c2409c6225d48) | Roster frozen + `rosterRoot` |
| 8 | `make sepolia-claim-bob` | [`0x79d9d24a…45de`](https://sepolia.etherscan.io/tx/0x79d9d24a569008ba368c4616f925c2731ec953e7d1820acb195f7d7586cc45de) | NFT → `0xDf409B20C5C78a941fD3F42F44Ffba9c36D5D622` |
| 9 | `make sepolia-claim-charlie` | [`0xcafb93a6…747e`](https://sepolia.etherscan.io/tx/0xcafb93a6945ce5ed76d1a453cf82b6200f6a64784ff9be7a394f5b545858747e) | NFT → `0xeB32ACd8254D017256717E2ca2762D392F77c648` |
| 10 | `make sepolia-nft` | [`ownerOf(1)`](https://sepolia.etherscan.io/address/0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5#readContract) · [`ownerOf(2)`](https://sepolia.etherscan.io/address/0x403FB7c8DE68E411A5aAfd08768d3fb70f2261F5#readContract) | Bob and Charlie own the NFTs |

Full copy (same data): [`deployed.md`](deployed.md).

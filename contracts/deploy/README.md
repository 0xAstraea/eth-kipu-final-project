# Deployment

Scripts to deploy TeamUp ZK to an EVM testnet (default target: **Sepolia**) and run a
real on-chain interaction. Nothing is deployed automatically; run these commands when
you have the credentials ready.

## 1. Configure secrets

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `SEPOLIA_RPC_URL` | JSON-RPC endpoint (Alchemy / Infura / other) |
| `DEPLOYER_PRIVATE_KEY` | Private key of a funded Sepolia account |
| `ETHERSCAN_API_KEY` | API key for contract verification |
| `COURSE_MEMBERS` | Optional: comma-separated identity commitments to enroll now |
| `OWNER_ADDRESS` | Optional: address that becomes the course owner instead of the deployer. On localhost it is also funded with 10 ETH. |
| `SEMAPHORE_ADDRESS` | Optional: reuse an existing Semaphore contract instead of the recorded one |
| `SEMAPHORE_VERIFIER_ADDRESS` | Optional: reuse an existing Semaphore verifier |
| `POSEIDON_T3_ADDRESS` | Optional: reuse an existing PoseidonT3 library |

`.env` is git-ignored. Do not commit it.

## 2. Deploy

```bash
pnpm run deploy:sepolia
```

This deploys `TeamRegistry`, then `TeamCredential` with the registry address as its
constructor argument, then wires `TeamRegistry` and `TeamCredential` together; optionally
enrolls `COURSE_MEMBERS` in a single transaction; and writes the addresses to
`deployments/sepolia.json`.

### The reusable Semaphore stack

`SemaphoreVerifier` and `PoseidonT3` hold no state, and `Semaphore` only holds group state,
where every registry creates its own group. So the whole stack is deployed once and reused by
every later deployment.

The canonical record lives in [`semaphore-stack.json`](semaphore-stack.json), one entry per
network. The deploy script resolves the addresses in this order:

1. the `SEMAPHORE_ADDRESS`, `SEMAPHORE_VERIFIER_ADDRESS` and `POSEIDON_T3_ADDRESS` env vars
2. the entry for the network in `semaphore-stack.json`
3. the entry for the network in the previous `deployments/<network>.json`
4. a fresh deployment of whatever is missing

An address is only reused when contract code is still on chain at that address. A newly
deployed stack is written back to `semaphore-stack.json`, so the next deployment is free.

## 3. Verify

One command verifies the five contracts with their constructor arguments, read from
`deployments/<network>.json`:

```bash
pnpm run verify:sepolia
```

It writes the library mapping that `Semaphore` needs into `deployments/libraries.mjs` and
submits each contract to every enabled explorer. The manual equivalent is:

```bash
pnpm --filter @teamup/contracts exec hardhat verify --network sepolia <TeamCredential> <TeamRegistry>
pnpm --filter @teamup/contracts exec hardhat verify --network sepolia <TeamRegistry> <Semaphore>

# Third-party contracts (optional). Semaphore needs the linked library address:
pnpm --filter @teamup/contracts exec hardhat verify --network sepolia <SemaphoreVerifier>
pnpm --filter @teamup/contracts exec hardhat verify --network sepolia --libraries \
  "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3:<PoseidonT3>" \
  <Semaphore> <SemaphoreVerifier>
pnpm --filter @teamup/contracts exec hardhat verify --network sepolia <PoseidonT3>
```

The compiler runs with the CBOR metadata disabled, to keep the deployed code small. The
verification uses the same settings, so the bytecode matches.

Paste the resulting explorer URLs into the main `README.md`.

## 4. Run a real interaction

```bash
pnpm run interact:sepolia
```

Runs the full flow on-chain with **freshly generated** identities (nothing hardcoded):
enrol three members in one transaction, create a team with a ZK proof, apply anonymously,
accept, fill the team, reveal it (which stores the roster commitment), and finally claim the
credential to a throwaway address. It prints the transaction hash of every step — copy them
into the `README.md` "On-chain evidence" section.

> The scripts generate random identities at runtime, so no usable secret is ever stored in
> the repository. For local development use `pnpm run demo` instead.

## 5. Local demo (localhost + frontend)

```bash
# terminal 1
pnpm run node

# terminal 2 — fresh deployment owned by the deployer (Hardhat account #0)
pnpm run deploy:localhost
pnpm run interact:localhost
pnpm run sync:frontend-env      # writes ../frontend/.env.local
```

`sync:frontend-env` reads `deployments/localhost.json` and writes `frontend/.env.local`,
so the frontend addresses never have to be copied by hand.

### Owning the protocol from your own MetaMask account

Importing the deployer private key is not required. Set `OWNER_ADDRESS` to your own
account before deploying:

```bash
# contracts/.env
OWNER_ADDRESS=0xYourMetaMaskAccount
```

```bash
pnpm run deploy:localhost       # funds OWNER_ADDRESS with 10 ETH and transfers ownership
pnpm run sync:frontend-env
```

Setting `OWNER_ADDRESS` requires `contracts/.env`, which the config now loads automatically
(`process.loadEnvFile`). Connect that account in the frontend: it is the course owner and can
enroll identities.

> `interact.ts` signs as the current owner and therefore only works when the owner is a local
> Hardhat account. If you set `OWNER_ADDRESS` to an external account (e.g. MetaMask), run the
> owner-only steps from the frontend instead.

For the demo with two roles, use two browsers: one with the owner account (enrolls) and one
with any other account (creates teams / applies).


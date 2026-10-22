# Deployment

Deploy TeamUp ZK to an EVM testnet (default: **Sepolia**) and run a real on-chain flow.
Nothing deploys until you run these commands with credentials ready.

## 1. Secrets

Copy `.env.example` to `.env`. Do not commit `.env`.

| Variable | Required | Meaning |
|---|---|---|
| `SEPOLIA_RPC_URL` | yes | JSON-RPC endpoint |
| `DEPLOYER_PRIVATE_KEY` | yes | Funded Sepolia key |
| `ETHERSCAN_API_KEY` | yes | Verification |
| `COURSE_MEMBERS` | no | Commitments to enroll now |
| `OWNER_ADDRESS` | no | Course owner (not deployer). On localhost: also gets 10 ETH |
| `SEMAPHORE_ADDRESS` | no | Reuse Semaphore |
| `SEMAPHORE_VERIFIER_ADDRESS` | no | Reuse verifier |
| `POSEIDON_T3_ADDRESS` | no | Reuse PoseidonT3 |

## 2. Deploy

```bash
pnpm run deploy:sepolia
```

Order: `TeamRegistry` → `TeamCredential(registry)` → wire → optional enroll.
Writes `deployments/sepolia.json`.

### Semaphore stack reuse

Verifier and PoseidonT3 hold no state. Each registry creates its own group on Semaphore.
Deploy the stack once; reuse it later.

Address resolution order:

1. Env vars
2. `semaphore-stack.json` for this network
3. Previous `deployments/<network>.json`
4. Fresh deploy of what is missing

Reuse only if code still exists at that address. New deploys update `semaphore-stack.json`.

## 3. Verify

```bash
pnpm run verify:sepolia
```

Reads constructor args from `deployments/<network>.json` and verifies all five contracts.
Compiler keeps CBOR metadata on so explorers can detect solc 0.8.28 and verify.

Paste explorer URLs into [`../README.md`](../README.md).

## 4. Interact

```bash
pnpm run interact:sepolia
```

Runs the full flow with fresh identities. Prints each tx hash.
Copy hashes into the "On-chain evidence" table.

For local narrated demo: `pnpm run demo`.

## 5. Local + frontend

```bash
# terminal 1
pnpm run node

# terminal 2
pnpm run deploy:localhost
pnpm run interact:localhost
pnpm run sync:frontend-env
```

`sync:frontend-env` writes `frontend/.env.local` from `deployments/localhost.json`.

### Own MetaMask as course owner

```bash
# contracts/.env
OWNER_ADDRESS=0xYourMetaMaskAccount
```

```bash
pnpm run deploy:localhost
pnpm run sync:frontend-env
```

`interact.ts` can only sign as a local Hardhat account.
With an external owner, run owner steps from the frontend.

Use two browsers for owner and student.

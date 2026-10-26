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
# or from repo root:
make deploy
```

Order: Semaphore stack (reuse or fresh) → `TeamRegistry` → `TeamCredential(registry)` → wire → optional enroll.
Writes `deployments/sepolia.json`.

### Semaphore stack reuse

Verifier and PoseidonT3 hold no state. Each registry creates its own group on Semaphore.
Deploy the stack once; reuse it later (`deploy/semaphore-stack.json`).

Address resolution order: env vars → `semaphore-stack.json` → previous `deployments/<network>.json` → fresh deploy.

## 3. Verify

```bash
make verify       # TeamRegistry + TeamCredential (Hardhat)
make verify-all   # also Semaphore stack via Etherscan Standard JSON
```

Sepolia addresses and `#code` links: [`../deployed.md`](../deployed.md).

## 4. Interact

```bash
make interact     # or: pnpm run interact:sepolia
```

Runs the full flow with fresh identities. Prints each tx hash for the evidence table.

Local narrated demo: `pnpm run demo`.

## 5. Local + frontend

```bash
# terminal 1
make node

# terminal 2
make deploy-local && make interact-local && make sync

# terminal 3
make frontend
```

### Own MetaMask as course owner

```bash
# .env
OWNER_ADDRESS=0xYourMetaMaskAccount
```

```bash
make deploy-local && make sync
```

`interact.ts` only signs as a local Hardhat account.
With an external owner, run owner steps from the frontend.
Use two browsers for owner and student.

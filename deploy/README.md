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

`.env` is git-ignored. Do not commit it.

## 2. Deploy

```bash
npx hardhat run deploy/deploy.ts --network sepolia
```

This deploys, in order: `SemaphoreVerifier`, `PoseidonT3`, `Semaphore` (linked to
`PoseidonT3`), `TeamCredential` and `TeamRegistry`; wires `TeamRegistry` and
`TeamCredential` together; optionally enrolls `COURSE_MEMBERS`; and writes the addresses
to `deployments/sepolia.json`.

## 3. Verify

Use the addresses printed by the deploy step and the constructor arguments:

```bash
npx hardhat verify --network sepolia <TeamCredential>
npx hardhat verify --network sepolia <TeamRegistry> <Semaphore>

# Third-party contracts (optional). Semaphore needs the linked library address:
npx hardhat verify --network sepolia <SemaphoreVerifier>
npx hardhat verify --network sepolia --libraries \
  "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3:<PoseidonT3>" \
  <Semaphore> <SemaphoreVerifier>
npx hardhat verify --network sepolia <PoseidonT3>
```

Paste the resulting explorer URLs into the main `README.md`.

## 4. Run a real interaction

```bash
npx hardhat run deploy/interact.ts --network sepolia
```

Runs the full flow on-chain with **freshly generated** identities (nothing hardcoded):
enrol three members, create a team with a ZK proof, apply anonymously, accept, claim the
credential to a throwaway address, and reveal the team. It prints the transaction hash of
every step — copy them into the `README.md` "On-chain evidence" section.

> The scripts generate random identities at runtime, so no usable secret is ever stored in
> the repository. For local development use `npx hardhat run scripts/demo.ts` instead.

# TeamUp ZK — Frontend

Web UI for the protocol. Creates Semaphore V4 ZK proofs in the browser.

Stack: Next.js 16 · React 19 · wagmi 3 · viem 2 · Tailwind 4 · Semaphore 4.14.3

## Requirements

- Node.js 20+
- EVM network: localhost (31337) or Sepolia
- Injected wallet (e.g. MetaMask)

## Config

Copy `.env.example` to `.env.local`:

| Variable | Meaning | Default |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `31337` or `11155111` | `31337` |
| `NEXT_PUBLIC_RPC_URL` | JSON-RPC URL | `http://127.0.0.1:8545` |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | `TeamRegistry` | — |
| `NEXT_PUBLIC_CREDENTIAL_ADDRESS` | `TeamCredential` | — |
| `NEXT_PUBLIC_SEMAPHORE_ADDRESS` | `Semaphore` | — |
| `NEXT_PUBLIC_FROM_BLOCK` | Event scan start | `0` |

From repo root, for localhost:

```bash
pnpm run sync:frontend-env
```

## Run

```bash
pnpm install                 # from repo root
pnpm run dev                 # http://localhost:3000
pnpm run build && pnpm --filter @teamup/frontend start
```

## Tests

```bash
pnpm test                                  # full repo (62)
pnpm --filter @teamup/frontend test        # frontend only (16)
```

Tests lock shared hash values with `test/protocol-values.test.ts`.

## Build notes

- **SSR reads:** `app/page.tsx` loads teams via viem (`force-dynamic`; empty if RPC is down).
- **Client writes:** wagmi `useWriteContract`.
- **ZK:** `lib/semaphore.ts` rebuilds the group from `CourseMemberAdded` events.
  ZK code loads with dynamic `import()` so WASM does not run during SSR/build.

## Personas

Tabs = actors (Professor, Alumn 1…). Each tab keeps its own Semaphore identities in `localStorage`.

| Action | Who | Contract rule |
|---|---|---|
| Enroll | Professor (owner) | `onlyOwner` |
| Create team | Enrolled member | `validateProof`; creator = admin |
| Accept | Team admin | `msg.sender == team.admin` |
| Reveal | Anyone | permissionless |
| Claim | Anyone pays gas | NFT → committed `claimAddress` |

Use two browsers for owner vs student.

## UI flow

1. Connect wallet (and network).
2. Select persona.
3. Create Semaphore identity (local only; commitment leaves the browser).
4. Enroll (owner).
5. Create team or apply (ZK proof, `scope = teamId`).
6. Admin accepts by nullifier; anyone reveals when ready.
7. Claim NFT after reveal.

## Notes

- Proof generation needs internet (CDN trusted-setup artifacts).
- Refresh ABIs: `pnpm run export:abis` → `lib/abis`.

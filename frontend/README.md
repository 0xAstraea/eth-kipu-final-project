# TeamUp ZK — Frontend

Interfaz web del protocolo TeamUp ZK. Permite operar todo el flujo contra una red EVM: crear equipos y postularse **generando la prueba de conocimiento cero (Semaphore V4) en el navegador**, sin exponer la identidad del alumno.

- **Next.js 16** (App Router, Turbopack) · **React 19**
- **wagmi 3** + **viem 2** + **TanStack Query** para wallet y lecturas/escrituras
- **Tailwind CSS 4**
- **@semaphore-protocol/identity · /group · /proof 4.14.3** para las pruebas ZK en el cliente

## Requisitos

- Node.js 20+
- Una red EVM: `localhost` (Hardhat, chainId 31337) o Sepolia
- MetaMask (u otra wallet inyectada)

## Configuración

Copiá `.env.example` a `.env.local` y completá las direcciones que imprime el deploy:

| Variable | Descripción | Default |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `31337` (localhost) o `11155111` (Sepolia) | `31337` |
| `NEXT_PUBLIC_RPC_URL` | Endpoint JSON-RPC | `http://127.0.0.1:8545` |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | Dirección de `TeamRegistry` | — |
| `NEXT_PUBLIC_CREDENTIAL_ADDRESS` | Dirección de `TeamCredential` | — |
| `NEXT_PUBLIC_SEMAPHORE_ADDRESS` | Dirección de `Semaphore` | — |
| `NEXT_PUBLIC_FROM_BLOCK` | Primer bloque a escanear para eventos | `0` |

Para localhost, generá las direcciones automáticamente desde `contracts/` con `npm run sync:frontend-env` (lee `contracts/deployments/localhost.json` y escribe este `.env.local`). También podés copiarlas a mano desde ese archivo.

## Correr

```bash
npm install
npm run dev        # http://localhost:3000
# producción
npm run build && npm start
```

## Cómo está construido

- **Lecturas en el servidor (SSR).** Un Server Component (`app/page.tsx`) lee `nextTeamId`, `getTeam`, `getTeamMembers` y los `CourseMemberAdded` vía `viem`, y renderiza la lista de equipos. La página es `force-dynamic` y tolera que el RPC no responda (muestra estado vacío), así `next build` funciona aunque no haya nodo levantado.
- **Escrituras en el cliente.** Los componentes de wallet usan wagmi (`useWriteContract`).
- **Pruebas ZK en el navegador.** `lib/semaphore.ts` reconstruye el grupo del curso a partir de los eventos `CourseMemberAdded` (Semaphore no expone enumeración de miembros on-chain) y genera el proof con `@semaphore-protocol/proof`. Todo el código ZK se carga con `import()` dinámico dentro de los handlers, para que el WASM de snarkjs nunca se evalúe durante el SSR/build.

## Flujo en la interfaz

1. **Conectar wallet** y, si hace falta, cambiar de red.
2. **Crear identidad** (Semaphore) — solo se guarda en `localStorage`; el commitment es lo único que sale del navegador.
3. **Enrolar** la identidad en el curso (solo la cuenta **owner** puede).
4. **Crear equipo** (con proof ZK scope = teamId).
5. **Postularse** (proof ZK scope = teamId, mensaje = `keccak256(presentation, claimCommitment)`); el `claimCommitment` fija el destinatario del NFT.
6. El **admin** del equipo acepta postulaciones por nullifier; con el equipo completo, **cualquiera revela** el equipo (congela el plantel y guarda el `rosterRoot`).
7. **Reclamar la credencial** (posible recién tras la revelación; NFT a la dirección elegida) y ver su metadata on-chain.

Para una demo con dos roles, usá dos navegadores/perfiles: uno con la cuenta owner (docente) y otro con una cuenta distinta (alumno).

## Notas

- Al generar un proof, `@semaphore-protocol/proof` descarga los artifacts del trusted setup desde un CDN: **el navegador necesita conexión a internet**.
- Los ABIs se generan desde los artifacts de Hardhat con `npm run export:abis` (dentro de `contracts/`) y se commitean en `lib/abis`.

## Evidencia

- `npm run lint` — sin errores.
- `npm run build` — compila y typechequea sin errores.
- SSR: con la red local y el protocolo desplegado, `curl http://localhost:3000` devuelve el HTML con los equipos leídos on-chain.

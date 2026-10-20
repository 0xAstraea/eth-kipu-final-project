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

Para localhost, generá las direcciones automáticamente desde la raíz con `pnpm run sync:frontend-env` (lee `contracts/deployments/localhost.json` y escribe este `.env.local`). También podés copiarlas a mano desde ese archivo.

## Correr

```bash
pnpm install       # desde la raíz del repo (workspace)
pnpm run dev       # http://localhost:3000
# producción
pnpm run build && pnpm --filter @teamup/frontend start
```

## Tests

```bash
pnpm test                                  # desde la raiz: contrato + frontend (62 tests)
pnpm --filter @teamup/frontend test        # solo el frontend (16 tests)
```

La suite del frontend fija los valores que el contrato y el navegador tienen que compartir
(el `claimCommitment` y el mensaje del proof), con los mismos valores que
`contracts/test/protocol-values.test.ts` fija del lado del contrato.

## Cómo está construido

- **Lecturas en el servidor (SSR).** Un Server Component (`app/page.tsx`) lee `nextTeamId`, `getTeam`, `getTeamMembers` y los `CourseMemberAdded` vía `viem`, y renderiza la lista de equipos. La página es `force-dynamic` y tolera que el RPC no responda (muestra estado vacío), así `next build` funciona aunque no haya nodo levantado.
- **Escrituras en el cliente.** Los componentes de wallet usan wagmi (`useWriteContract`).
- **Pruebas ZK en el navegador.** `lib/semaphore.ts` reconstruye el grupo del curso a partir de los eventos `CourseMemberAdded` (Semaphore no expone enumeración de miembros on-chain) y genera el proof con `@semaphore-protocol/proof`. Todo el código ZK se carga con `import()` dinámico dentro de los handlers, para que el WASM de snarkjs nunca se evalúe durante el SSR/build.

## Personas (pestañas por rol)

La demo se maneja por **personas**, no por una sola identidad. Cada pestaña es un actor con sus
propias identidades Semaphore y sus propias postulaciones, guardado todo en `localStorage`:

- **Professor** — el dueño del curso. Su poder es **enrolar** identidades en el grupo Semaphore
  (una a una o todas en una transacción con `addCourseMembers`). No acepta postulaciones: esa
  decisión es del admin de cada equipo.
- **Alumn 1, 2, 3…** — cada alumno tiene su pestaña: crea su identidad, crea equipos (con lo que
  se vuelve admin de ese equipo), se postula a los equipos de otros, **acepta** a quienes se
  postulan a sus equipos y reclama su credencial.

El reparto de poderes es el del contrato, no una convención de la interfaz:

| Acción | Quién puede | Cómo lo impone el contrato |
|---|---|---|
| Enrolar en el curso | Professor (owner) | `onlyOwner` |
| Crear equipo | Cualquier miembro enrolado | `validateProof` + es admin |
| Aceptar postulaciones | **Admin de ese equipo** | `msg.sender == team.admin` |
| Revelar el equipo | Cualquiera | `reveal` es *permissionless* |
| Reclamar la credencial | Cualquiera paga el gas | el NFT va al `claimAddress` fijado |

Para saber qué pestaña es la dueña de cada equipo, la interfaz guarda un mapa local
`teamId → persona` (`teamup-zk-team-owners`) que se escribe al crear el equipo; si el equipo se
creó en otro navegador, se recurre al admin on-chain.

Se pueden **agregar** personas (`+ Persona`), renombrarlas, borrarlas y **vincularles una
wallet** (para recordar con qué cuenta hay que operar). El estado se migra solo: las
identidades y postulaciones creadas antes de las personas quedan asignadas al profesor.

## Flujo en la interfaz

1. **Conectar wallet** y, si hace falta, cambiar de red.
2. **Elegir persona** en las pestañas: profesor o alumno.
3. **Crear identidad** (Semaphore) — solo se guarda en `localStorage`; el commitment es lo único que sale del navegador.
4. **Enrolar** la identidad en el curso (solo la cuenta **owner** puede; el profesor lo hace desde la pestaña Professor).
5. **Crear equipo** (con proof ZK scope = teamId) — quien lo crea es su admin.
6. **Postularse** (proof ZK scope = teamId, mensaje = `keccak256(presentation, claimCommitment)`); el `claimCommitment` fija el destinatario del NFT.
7. El **admin del equipo** acepta postulaciones por nullifier; con el equipo completo, **cualquiera revela** el equipo (congela el plantel y guarda el `rosterRoot`).
8. **Reclamar la credencial** (posible recién tras la revelación; NFT a la dirección elegida) y ver su metadata on-chain.

Para una demo con dos roles, usá dos navegadores/perfiles: uno con la cuenta owner (docente) y otro con una cuenta distinta (alumno).

## Notas

- Al generar un proof, `@semaphore-protocol/proof` descarga los artifacts del trusted setup desde un CDN: **el navegador necesita conexión a internet**.
- Los ABIs se generan desde los artifacts de Hardhat con `pnpm run export:abis` y se commitean en `lib/abis`.

## Evidencia

- `pnpm test` — 62 tests, sin errores.
- `pnpm run lint` — sin errores.
- `pnpm run build` — compila y typechequea sin errores.
- SSR: con la red local y el protocolo desplegado, `curl http://localhost:3000` devuelve el HTML con los equipos leídos on-chain.

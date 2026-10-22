# TeamUp ZK

Formación de equipos con membresía verificable. Los estudiantes demuestran con una **prueba de conocimiento cero (Semaphore V4)** que pertenecen al curso y se postulan a equipos **sin revelar su identidad**: la postulación se registra por un **nullifier** (seudónimo criptográfico), no por una dirección. Al ser aceptados reciben una **credencial NFT**.

Un defecto de la planilla compartida: no verifica nada, no impide postularse dos veces con identidades distintas y no deja un registro verificable. Un servidor central podría simular anonimato, pero obligaría a **confiar** en que no correlaciona postulaciones ni altera el registro. TeamUp ZK pone las reglas en contrato (membresía ZK, nullifiers anti-Sybil, `rosterRoot` y credencial NFT) para que cualquiera pueda **verificarlas**. Justificación completa en [`WHITEPAPER.md`](WHITEPAPER.md) §2.

## Estructura del repositorio

```
.
├── contracts/     Protocolo Solidity + tests, coverage, Slither y scripts de deploy
├── frontend/      App Next.js 16 + wagmi 3 con pruebas ZK generadas en el navegador
├── package.json   Workspace pnpm: un solo install y un solo `pnpm test`
├── WHITEPAPER.md  Problema, modelo de amenazas, diseño y roadmap
└── README.md
```

- **`contracts/`** — `TeamRegistry` (lógica), `TeamCredential` (ERC721) y todo el tooling Hardhat. Guía completa en [`contracts/README.md`](contracts/README.md).
- **`frontend/`** — interfaz para operar el protocolo contra localhost o Sepolia. Guía completa en [`frontend/README.md`](frontend/README.md).

El repo es un **workspace de pnpm**: `contracts/` y `frontend/` se instalan juntos y se prueban
con un solo comando desde la raíz.

## Inicio rápido

```bash
pnpm install          # instala contracts/ y frontend/
pnpm test             # 62 tests: 46 del contrato + 16 del frontend
pnpm run check        # typecheck + lint + tests de los dos paquetes
pnpm run build        # compila los contratos y el frontend
```

### Frontend

```bash
cd frontend
cp .env.example .env.local   # completar direcciones y RPC
pnpm run dev                 # http://localhost:3000
```

## Demo local completa (para el video)

Levanta una red local, despliega el protocolo, genera actividad on-chain y abre la interfaz.

```bash
# terminal 1 — red local
pnpm run node

# terminal 2 — deploy + interacción (imprime el hash de cada tx)
pnpm run deploy:localhost
pnpm run interact:localhost          # crea un equipo, postula, acepta, reclama y revela
pnpm run export:abis                 # refresca los ABIs que usa el frontend
pnpm run sync:frontend-env           # escribe frontend/.env.local con las direcciones

# terminal 3 — frontend apuntando a localhost
cd frontend
pnpm run dev
```

En el navegador, conectá MetaMask a `localhost:31337` (Chain ID 31337). Para la demo con dos roles, usá **dos navegadores/perfiles** con dos cuentas (una como docente/owner, otra como alumno).

> **No hace falta importar la private key del deployer.** Por defecto el curso queda a nombre de la cuenta #0 de Hardhat; si querés usar tu propia cuenta de MetaMask como docente, poné su dirección en `contracts/.env` como `OWNER_ADDRESS` antes de desplegar: el script la financia con 10 ETH y le transfiere la propiedad del curso. Con un owner externo, hacé los pasos de owner (enrolar) desde el frontend, porque `interact.ts` solo puede firmar por cuentas locales de Hardhat. Detalle en [`contracts/deploy/README.md`](contracts/deploy/README.md).

## Checklist de entrega

Mapa entre los requisitos de la cátedra y dónde está resuelto cada uno.

| Requisito | Dónde está |
|---|---|
| Contratos desplegados en red EVM, verificados, con URL del explorer | [`contracts/README.md`](contracts/README.md) → "Red utilizada y contratos desplegados" (completar tras el deploy) |
| Interacción real on-chain del flujo principal | [`contracts/README.md`](contracts/README.md) → "Evidencia on-chain" (los hashes que imprime `interact.ts`) |
| NatSpec completo: estado, eventos y sus parámetros, custom errors, funciones, modificadores | `contracts/contracts/TeamRegistry.sol`, `contracts/contracts/TeamCredential.sol` |
| Custom errors, sin strings de error | `contracts/contracts/*.sol` (todos los reverts son custom errors) |
| Checks-Effects-Interactions | `claimCredential` marca `application.claimed = true` antes del mint externo |
| Eventos para trazabilidad | `CourseMemberAdded`, `CredentialSet`, `TeamCreated`, `JoinRequested`, `JoinAccepted`, `CredentialClaimed`, `TeamRevealed` |
| Optimización de tipos para gas | `admin` + `maxMembers` + `revealAtBlock` en un slot; `rosterRoot` como marcador de revelado; guard transient |
| `constant` / `immutable` | `SNARK_FIELD_SIZE`, `semaphore`, `courseGroupId`, `registry` de la credencial |
| `unchecked` donde no puede haber overflow | `teamCounter`, `_nextTokenId`, el índice del batch de enrolados |
| Sin `tx.origin`, `delegatecall`, `selfdestruct` ni `assembly` | verificado por grep y por Slither |
| SafeERC20 | no aplica: el protocolo no mueve ERC20 |
| Proxies / upgradeability | no se usan |
| Tests que pasan, flujo principal, reverts, coverage > 40% | `pnpm test` (62 tests), `pnpm run coverage` (100% líneas y statements) |
| Slither ejecutado sobre el contrato principal, findings triados | [`contracts/security/slither-report.md`](contracts/security/slither-report.md) |
| Frontend que interactúa con los contratos | `frontend/` (Next.js 16 + wagmi 3, pruebas ZK en el navegador) |
| README con arquitectura, instalación, tests, coverage, Slither, uso, red, direcciones, URLs verificadas, hashes de tx, limitaciones y roadmap | este README, [`contracts/README.md`](contracts/README.md) y [`WHITEPAPER.md`](WHITEPAPER.md) |
| Sin secretos en el repo | `.env` ignorado, `.env.example` con placeholders, escaneo de claves y URLs |
| Roadmap de fase 2 | [`WHITEPAPER.md`](WHITEPAPER.md) → "Roadmap" y `contracts/README.md` |

Pendiente de tu lado, porque depende de credenciales y de datos que solo están en tu
cuenta: el deploy en Sepolia, la verificación en el explorer, los hashes de transacción para
la tabla de evidencia, hacer público el repositorio, los commits de cada integrante del
equipo y el video de hasta 5 minutos.

## Cómo funciona, en una línea

El docente agrega los commitments de los alumnos al grupo del curso; un alumno **crea un equipo** o **se postula** adjuntando un proof ZK de membresía; el equipo acepta por **nullifier** y el alumno reclama su **credencial NFT** a la dirección que elija (puede ser desechable).

Detalle completo, decisiones de diseño y limitaciones en [`WHITEPAPER.md`](WHITEPAPER.md) y [`contracts/README.md`](contracts/README.md).

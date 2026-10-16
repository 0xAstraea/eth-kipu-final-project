# TeamUp ZK

Formación de equipos con membresía verificable: un protocolo on-chain donde los estudiantes demuestran que pertenecen al curso con una **prueba de conocimiento cero (Semaphore)** y se postulan a equipos **sin revelar su identidad**, recibiendo una credencial NFT al ser aceptados.

> Para el análisis de producto, el modelo de amenazas y el detalle de diseño, ver [`../WHITEPAPER.md`](../WHITEPAPER.md).
> La interfaz web (Next.js + wagmi, con pruebas ZK en el navegador) está en [`../frontend`](../frontend).

## El problema

En el curso actual, buscar equipo se resuelve con una planilla compartida. Ese mecanismo no verifica nada: cualquiera puede publicar cualquier dato, no hay forma de comprobar que alguien es compañero del curso, no se puede evitar que una persona se postule varias veces con identidades distintas, y no queda ningún registro verificable de los acuerdos.

TeamUp ZK reemplaza la planilla por un protocolo donde:

- solo estudiantes verificados por el docente pueden crear equipos y postularse;
- la postulación se identifica por un **nullifier** (seudónimo criptográfico), nunca por una dirección;
- la aceptación la decide el equipo, y la credencial resultante (NFT) se puede reclamar en una dirección desechable;
- todo queda registrado en eventos para la trazabilidad.

## Arquitectura

```
                        ┌──────────────────────┐
                        │   Course Owner       │  (el docente)
                        │   (Ownable)          │
                        └──────────┬───────────┘
                                   │ addCourseMember(identityCommitment)
                                   ▼
  ┌───────────────────────────────────────────────────────┐
  │  Semaphore.sol  (PSE - zero-knowledge group)          │
  │  - Grupo del curso (Merkle tree LeanIMT)              │
  │  - verifyProof / validateProof (quema nullifiers)     │
  └───────────────────────────┬───────────────────────────┘
                              │ validateProof()
                              ▼
  ┌───────────────────────────────────────────────────────┐
  │  TeamRegistry.sol  (propio)                            │
  │  - createTeam()      → admin + miembros (por nullifier)│
  │  - requestJoin()     → postulación por nullifier       │
  │  - acceptRequest()   → decisión del admin              │
  │  - claimCredential() → NFT vía commit-reveal           │
  │  - reveal()          → cierre (cupo o nº de bloque)    │
  └───────────────────────────┬───────────────────────────┘
                              │ mint()
                              ▼
  ┌───────────────────────────────────────────────────────┐
  │  TeamCredential.sol (ERC721 - OZ)                      │
  │  Certificado de pertenencia, metadata on-chain         │
  └───────────────────────────────────────────────────────┘
```

**Composición sobre herencia:** `TeamRegistry` **no** hereda `Semaphore`, lo usa vía interfaz.
Si heredara, cualquiera podría llamar `addMember` directamente y bypassear el `onlyOwner` del docente. El grupo del curso se crea con `TeamRegistry` como admin, así que la única puerta de entrada es `addCourseMember`.

## Cómo funciona (paso a paso)

| # | Actor | Acción | Resultado on-chain |
|---|---|---|---|
| 1 | Docente | `addCourseMember(commitment)` | El alumno entra al grupo ZK del curso |
| 2 | Alice | `createTeam(name, desc, max, revealAtBlock, proof)` | Equipo creado; el proof ZK (scope = teamId) verifica membresía |
| 3 | Bob | `requestJoin(teamId, presentation, claimCommitment, proof)` | Postulación registrada **por nullifier**; carta + commitment autenticados dentro del proof |
| 4 | Eve (no es del curso) | `requestJoin(...)` | Revert: `Semaphore__InvalidProof` |
| 5 | Alice | `acceptRequest(teamId, nullifier)` | Nullifier marcado como miembro |
| 6 | Bob | `claimCredential(teamId, nullifier, claimAddress, salt)` | NFT minteado a `claimAddress` (puede ser desechable) |
| 7 | Alguien | `reveal(teamId)` | Requiere cupo lleno o `block.number >= revealAtBlock`; emite `TeamRevealed` con los nullifiers |

### Por qué no se "doxxea" a nadie

La postulación **nunca almacena `msg.sender`**. El contrato guarda:

```
Application {
    bytes32 claimCommitment;   // keccak256(claimAddress, salt) - irreversible
    bool accepted;
    bool claimed;
}
```

El address solamente puede aparecer si el propio usuario lo revela voluntariamente al reclamar su credencial, y puede usar una dirección desechable. Otras personas pueden pagar el gas del claim: el NFT siempre va al `claimAddress` fijado en el commitment (front-running del claim es inocuo).

## Instalación y compilación

```bash
npm install
npx hardhat compile
```

## Tests y coverage

```bash
# suite completa (26 tests)
npx hardhat test

# coverage con la herramienta built-in de Hardhat 3
npx hardhat test --coverage
```

Resultado del coverage sobre el código propio: **85.85% de líneas y 86.96% de statements** (ambas por encima del 40% exigido). El reporte HTML queda en `coverage/html`.

## Análisis estático (Slither)

```bash
uv tool install slither-analyzer          # alternativa: pip install slither-analyzer
slither . --filter-paths "node_modules|openzeppelin|semaphore|poseidon"
```

El triage completo de los findings (corregidos y aceptados con justificación) está en [`security/slither-report.md`](security/slither-report.md).

## Demo local

```bash
# flujo completo narrado por consola (para el video)
npx hardhat run scripts/demo.ts
```

## Estructura

```
contracts/
  TeamRegistry.sol          Núcleo del protocolo (Solidity + NatSpec)
  TeamCredential.sol        ERC721 credencial (OpenZeppelin)
  interfaces/ITeamCredential.sol  Interfaz entre registry y credencial
test/
  TeamRegistry.test.ts      21 tests: sybil, anti-doxxeo, commit-reveal, reveal
  TeamCredential.test.ts    5 tests: permisos, metadata, flujo completo
  helpers/setup.ts          Fixtures + generación de proofs ZK off-chain
deploy/
  deploy.ts                 Deploy completo a una red (Sepolia por defecto)
  interact.ts               Corre el flujo on-chain con identidades nuevas
  README.md                 Instrucciones de deploy y verificación
scripts/
  demo.ts                   Flujo completo narrado (para el video)
  00-smoke.ts               Smoke test del pipeline Semaphore (deploy + proof)
  lib/protocol.ts           Helpers de deploy y generación de proofs
  export-abis.mjs           Exporta los ABIs a ../frontend/lib/abis (npm run export:abis)
  sync-frontend-env.mjs     Escribe ../frontend/.env.local desde deployments/ (npm run sync:frontend-env)
security/
  slither-report.md         Triage de findings de Slither
```

Las dependencias `Semaphore.sol`, `SemaphoreVerifier.sol` y `PoseidonT3` se instalan por npm (`@semaphore-protocol/contracts`, `poseidon-solidity`) y se despliegan con `getContractFactory`.

## Deploy en testnet y verificación

Instrucciones completas en [`deploy/README.md`](deploy/README.md). Resumen:

```bash
cp .env.example .env       # completar SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY
npx hardhat run deploy/deploy.ts --network sepolia
npx hardhat verify --network sepolia <TEAM_CREDENTIAL>
npx hardhat verify --network sepolia <TEAM_REGISTRY> <SEMAPHORE_ADDRESS>
```

## Red utilizada y contratos desplegados

> _Pendiente: completar tras desplegar en Sepolia._

| Contrato | Dirección | Código verificado |
|---|---|---|
| TeamRegistry | `0x…` | [Sepolia Etherscan](https://sepolia.etherscan.io/) |
| TeamCredential | `0x…` | [Sepolia Etherscan](https://sepolia.etherscan.io/) |
| Semaphore (PSE) | `0x…` | [Sepolia Etherscan](https://sepolia.etherscan.io/) |

## Evidencia on-chain (flujo principal)

> _Pendiente: `deploy/interact.ts` imprime el hash de cada paso; pegarlos aquí._

| Paso | Transacción |
|---|---|
| addCourseMember | `0x…` |
| createTeam | `0x…` |
| requestJoin | `0x…` |
| acceptRequest | `0x…` |
| claimCredential | `0x…` |
| reveal | `0x…` |


## Decisiones de diseño

- **Reloj por bloque, no por timestamp.** `revealAtBlock` usa `block.number` en vez de timestamps: es más barato de verificar, no depende de la honestidad del validador y es determinista en tests.
- **Firmas ECDSA no, ZK sí.** En un curso chico el docente es un emisor confiable, pero el protocolo igualmente le exige al alumno *demostrar* membresía sin exponer su identidad: la confianza mínima necesaria se traslada al gatekeeper (docente) y todo lo demás es criptografía.
- **Commit-reveal en vez del circuito de "ownership" de Semaphore.** Ese circuito solo existe en el repo experimental de PSE (no auditado); `keccak256(address, salt)` resuelve el mismo problema sin depender de código experimental.

### Limitaciones conocidas (honestidad por diseño)

1. **Anonimato estadístico:** la [documentación de Semaphore](https://docs.semaphore.pse.dev) advierte que grupos de 1-2 miembros no son anónimos. La privacidad real crece con el tamaño del grupo.
2. **El emisor de la tx de postulación es público en el bloque:** para ocultarlo del todo haría falta un relayer (fase 2).
3. **Griefing:** alguien podría copiar un proof del mempool y minarlo antes, quemando el nullifier de la víctima para ese equipo. En red local no aplica; en producción se mitiga con Flashbots/relayers privados.

## Roadmap (fase 2)

| Prioridad | Feature | Notas |
|---|---|---|
| 1 | **Staking + slashing** | Depósito al unirse; el equipo vota el slashing de quien abandona |
| 2 | **Relayer** | Oculta el `msg.sender` de la postulación y elimina el griefing |
| 3 | **Reclutamiento ciego** | Aceptar por nullifier y revelar recién al claim, con el circuito de ownership de Semaphore cuando madure en el SDK estable |
| 4 | **Reputación acumulativa** | Credenciales por participación, sin puntuaciones públicas |
| 5 | **Matching off-chain** | Filtros por skills/roles sobre los grupos, vía subgraph |
| 6 | ~~**Interfaz web**~~ | Entregado: panel Next.js + wagmi con pruebas ZK en el navegador (`../frontend`) |

## Notas de seguridad implementadas

- `validateProof` de Semaphore quema nullifiers: imposible postularse dos veces al mismo equipo.
- El message del proof incluye `keccak256(presentation, claimCommitment)`: ni la carta ni el commitment pueden alterarse.
- Checks-Effects-Interactions en todas las funciones con estado y `ReentrancyGuard` (`nonReentrant`) en las funciones con llamadas externas.
- Errores custom (sin strings) y eventos para cada transición de estado.
- `Semaphore`, `courseGroupId` y `SNARK_FIELD_SIZE` son `immutable`/`constant`; `unchecked` en incrementos que no pueden desbordar.
- OZ v5: `Ownable`, `ERC721`, `ReentrancyGuard`. Sin dependencias de librerías externas más allá de Semaphore/OZ.
- **Tests:** miembro entra; no-miembro revert; doble postulación revert; mensaje alterado revert; claim con salt incorrecto revert; claim antes de aceptación revert; reveal prematuro revert; equipo lleno revert; NFT a address desechable y no al sender.

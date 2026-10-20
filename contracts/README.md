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
                                   │ addCourseMembers(identityCommitments[])
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
  │  - claimCredential() → NFT (requiere reveal)           │
  │  - reveal()         → cierre + rosterRoot (cupo/bloque)│
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
| 1 | Docente | `addCourseMember(commitment)` o `addCourseMembers(commitments[])` | El alumno entra al grupo ZK del curso |
| 2 | Alice | `createTeam(name, desc, max, revealAtBlock, proof)` | Equipo creado; el proof ZK (scope = teamId) verifica membresía |
| 3 | Bob | `requestJoin(teamId, presentation, claimCommitment, proof)` | Postulación registrada **por nullifier**; carta + commitment autenticados dentro del proof |
| 4 | Eve (no es del curso) | `requestJoin(...)` | Revert: `Semaphore__InvalidProof` |
| 5 | Alice | `acceptRequest(teamId, nullifier)` | Nullifier marcado como miembro |
| 6 | Alguien | `reveal(teamId)` | Requiere cupo lleno o `block.number >= revealAtBlock`; guarda `rosterRoot = keccak256(sorted nullifiers)` y emite `TeamRevealed` |
| 7 | Bob | `claimCredential(teamId, nullifier, claimAddress, salt)` | Requiere equipo ya revelado; NFT minteado a `claimAddress` (puede ser desechable) |

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

El repo es un workspace de pnpm. Desde la raíz:

```bash
pnpm install
pnpm run compile            # compila los contratos
```

El compilador no emite warnings sobre el código propio. El único aviso es el de OpenZeppelin
sobre transient storage (EIP-1153), que viene de `TransientSlot.sol` y dice textualmente que
el uso en un guard de reentrada es seguro. Está analizado: el guard se usa solo como
`nonReentrant`, y el estado transitorio se limpia al final de cada llamada.

## Tests y coverage

```bash
# suite completa del contrato (46 tests)
pnpm --filter @teamup/contracts test

# la suite completa del repo: contrato + frontend (62 tests)
pnpm test

# coverage con la herramienta built-in de Hardhat 3
pnpm run coverage
```

Resultado del coverage sobre el código propio: **100% de líneas y 100% de statements** en
`TeamRegistry.sol` y `TeamCredential.sol`. El reporte HTML queda en `coverage/html`.

## Análisis estático (Slither)

```bash
uv tool install slither-analyzer          # alternativa: pip install slither-analyzer
slither . --filter-paths "node_modules|openzeppelin|semaphore|poseidon"
```

El triage completo de los findings (corregidos y aceptados con justificación) está en [`security/slither-report.md`](security/slither-report.md).

Última corrida sobre el código final: **33 contratos analizados, 102 detectores, 3 findings**,
los tres aceptados con justificación técnica. La salida cruda no se versiona: se regenera
con el comando de arriba.

## Demo local

```bash
# flujo completo narrado por consola (para el video)
pnpm run demo
```

## Estructura

```
contracts/
  TeamRegistry.sol          Núcleo del protocolo (Solidity + NatSpec)
  TeamCredential.sol        ERC721 credencial (OpenZeppelin)
  interfaces/ITeamCredential.sol  Interfaz entre registry y credencial
  GAS-OPTIMIZATION-REPORT.md Análisis de costos de gas, con las mediciones
  gas-snapshot.json            Mediciones de gas, una entrada por medición
test/
  TeamRegistry.test.ts      25 tests: sybil, anti-doxxeo, commit-reveal, reveal, rosterRoot, empaquetado
  TeamCredential.test.ts    4 tests: registry fijo, permisos, metadata, flujo completo
  helpers/setup.ts          Fixtures + generación de proofs ZK off-chain
deploy/
  deploy.ts                 Deploy completo a una red (Sepolia por defecto), reutiliza el stack Semaphore
  interact.ts               Corre el flujo on-chain con identidades nuevas
  semaphore-stack.json      Direcciones del stack Semaphore reutilizable, por red
  README.md                 Instrucciones de deploy y verificación
scripts/
  demo.ts                   Flujo completo narrado (para el video)
  00-smoke.ts               Smoke test del pipeline Semaphore (deploy + proof)
  lib/protocol.ts           Helpers de deploy y generación de proofs
  export-abis.mjs           Exporta los ABIs a ../frontend/lib/abis (pnpm run export:abis)
  sync-frontend-env.mjs     Escribe ../frontend/.env.local desde deployments/ (pnpm run sync:frontend-env)
  gas-profile.ts            Perfilador de gas (despliega y mide el flujo completo)
  gas-compare.mjs           Compara dos entradas de gas-snapshot.json
  gas-size.ts               Tamaño del bytecode desplegado de nuestros contratos
  gas-run.sh                Corre el perfilador con un nombre
security/
  slither-report.md         Triage de findings de Slither
```

Las dependencias `Semaphore.sol`, `SemaphoreVerifier.sol` y `PoseidonT3` se instalan con pnpm (`@semaphore-protocol/contracts`, `poseidon-solidity`) y se despliegan con `getContractFactory`.

## Deploy en testnet y verificación

Instrucciones completas en [`deploy/README.md`](deploy/README.md). Resumen:

```bash
cp .env.example .env       # completar SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY
pnpm run deploy:sepolia
pnpm --filter @teamup/contracts exec hardhat verify --network sepolia <TEAM_CREDENTIAL> <TEAM_REGISTRY_ADDRESS>
pnpm --filter @teamup/contracts exec hardhat verify --network sepolia <TEAM_REGISTRY> <SEMAPHORE_ADDRESS>
```

`TeamCredential` se despliega con la dirección del `TeamRegistry` como argumento del constructor, así que el registry se despliega primero. El stack de Semaphore (verificador, PoseidonT3 y Semaphore) se reutiliza entre despliegues: las direcciones quedan en [`deploy/semaphore-stack.json`](deploy/semaphore-stack.json) y se pueden pisar con `SEMAPHORE_ADDRESS`, `SEMAPHORE_VERIFIER_ADDRESS` y `POSEIDON_T3_ADDRESS`.

## Red utilizada y contratos desplegados

> _Pendiente: completar tras desplegar en Sepolia con credenciales reales._

**Cómo desplegar y verificar (desde la raíz del repo):**

```bash
pnpm run deploy:sepolia     # despliega y escribe contracts/deployments/sepolia.json
pnpm run verify:sepolia     # verifica los 5 contratos en Etherscan
pnpm run interact:sepolia   # corre el flujo principal e imprime los hashes de cada paso
```

`deploy:sepolia` imprime las direcciones y las guarda en `contracts/deployments/sepolia.json`.
`verify:sepolia` lee ese archivo y verifica cada contrato con los argumentos de su
constructor. `interact:sepolia` corre el flujo completo con identidades nuevas e imprime el
hash de cada transacción.

| Contrato | Dirección | Código verificado |
|---|---|---|
| TeamRegistry | `0x…` | [Sepolia Etherscan](https://sepolia.etherscan.io/address/0x…) |
| TeamCredential | `0x…` | [Sepolia Etherscan](https://sepolia.etherscan.io/address/0x…) |
| Semaphore (PSE) | `0x…` | [Sepolia Etherscan](https://sepolia.etherscan.io/address/0x…) |
| SemaphoreVerifier (PSE) | `0x…` | [Sepolia Etherscan](https://sepolia.etherscan.io/address/0x…) |
| PoseidonT3 | `0x…` | [Sepolia Etherscan](https://sepolia.etherscan.io/address/0x…) |

## Evidencia on-chain (flujo principal)

> _Pendiente: `deploy/interact.ts` imprime el hash de cada paso; pegarlos aquí._

| Paso | Transacción |
|---|---|
| addCourseMembers | `0x…` |
| createTeam | `0x…` |
| requestJoin | `0x…` |
| acceptRequest | `0x…` |
| reveal | `0x…` |
| claimCredential | `0x…` |


## Costos de gas

El análisis completo, con las mediciones antes y después de cada cambio, está en
[`GAS-OPTIMIZATION-REPORT.md`](GAS-OPTIMIZATION-REPORT.md). Resumen de lo aplicado:

| Ítem | Antes | Después |
|---|---|---|
| Deploy del stack completo | 11,972,738 | 2,832,401 (reutilizando Semaphore) |
| Flujo de un equipo (5 tx) | 1,096,829 | 1,034,042 |

- El stack de Semaphore no tiene estado en el verificador ni en la librería Poseidon, y cada registry crea su propio grupo. Se despliega una vez y se reutiliza.
- `Team` empaqueta `admin`, `maxMembers` y `revealAtBlock` en un solo slot, y el estado "revelado" se deriva de `rosterRoot` en vez de un bool aparte.
- `nonReentrant` usa `ReentrancyGuardTransient` (EIP-1153): misma protección, sin escribir un slot de storage.
- La metadata CBOR del compilador está desactivada: son 53 bytes menos de code deposit por contrato.
- `addCourseMembers` inscribe a varios alumnos en una sola transacción.

```bash
pnpm run gas                              # perfilador, escribe gas-snapshot.json
node scripts/gas-compare.mjs baseline applied   # diff contra la medición base
node scripts/gas-compare.mjs baseline applied
```

## Decisiones de diseño

- **Reloj por bloque, no por timestamp.** `revealAtBlock` usa `block.number` en vez de timestamps: es más barato de verificar, no depende de la honestidad del validador y es determinista en tests.
- **Firmas ECDSA no, ZK sí.** En un curso chico el docente es un emisor confiable, pero el protocolo igualmente le exige al alumno *demostrar* membresía sin exponer su identidad: la confianza mínima necesaria se traslada al gatekeeper (docente) y todo lo demás es criptografía.
- **Commit-reveal en vez del circuito de "ownership" de Semaphore.** Ese circuito solo existe en el repo experimental de PSE (no auditado); `keccak256(address, salt)` resuelve el mismo problema sin depender de código experimental.
- **`reveal` finaliza el equipo y ancla el plantel.** Además de congelar la composición, `reveal` guarda `rosterRoot = keccak256` de los nullifiers **ordenados**: un compromiso reproducible desde un solo hash (independiente del orden de aceptación). Y `claimCredential` exige que el equipo esté revelado, así la credencial certifica pertenencia a un equipo ya finalizado. La revelación es *permissionless* (cualquiera puede dispararla si se cumple la condición), por lo que no bloquea a los miembros.

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
- Checks-Effects-Interactions en todas las funciones con estado y `ReentrancyGuardTransient` (`nonReentrant`) en las funciones con llamadas externas.
- Errores custom (sin strings) y eventos para cada transición de estado.
- `Semaphore`, `courseGroupId`, `SNARK_FIELD_SIZE` y el `registry` de la credencial son `immutable`/`constant`; `unchecked` en incrementos que no pueden desbordar.
- OZ v5: `Ownable`, `ERC721`, `ReentrancyGuardTransient`. Sin dependencias de librerías externas más allá de Semaphore/OZ.
- **Tests:** miembro entra; no-miembro revert; doble postulación revert; mensaje alterado revert; claim con salt incorrecto revert; claim antes de aceptación revert; claim antes de revelar revert; reveal prematuro revert; equipo lleno revert; `rosterRoot` determinista; NFT a address desechable y no al sender.

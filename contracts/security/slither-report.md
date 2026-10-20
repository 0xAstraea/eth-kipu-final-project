# Análisis estático con Slither

- **Herramienta:** Slither `0.11.6` (instalado con `uv tool install slither-analyzer`)
- **Framework de compilación:** Hardhat 3 (detectado automáticamente por `crytic-compile`)
- **Comando:**

  ```bash
  slither . --filter-paths "node_modules|openzeppelin|semaphore|poseidon"
  ```

- **Alcance:** `contracts/TeamRegistry.sol` y `contracts/TeamCredential.sol` (código propio).
  Las dependencias externas (`@openzeppelin/contracts`, `@semaphore-protocol/contracts`,
  `poseidon-solidity`) se excluyen del análisis.
- **Salida cruda:** no se versiona. Se regenera con el comando de arriba.
- **Nota de resolución de imports:** con pnpm, `crytic-compile` resuelve los imports de los
  paquetes transitivos contra `contracts/node_modules`. Por eso `@zk-kit/lean-imt.sol` y
  `poseidon-solidity` están declarados como dependencias de desarrollo del paquete de
  contratos: sin ellos, Slither no puede compilar las dependencias de Semaphore.

## Resumen

Corrida inicial: **9 findings**. Tras las correcciones: **3 findings**, todos los restantes
aceptados con justificación (la llamada externa es a un contrato inmutable de confianza y las
funciones están protegidas con `nonReentrant`).

Corrida sobre el código final (con el registro empaquetado, el guard transient y la credencial
con registry inmutable): **33 contratos analizados, 102 detectores, 3 findings**, los mismos
tres, todos aceptados.

| # | Detector | Contrato | Estado |
|---|----------|----------|--------|
| 1 | `reentrancy-events` (x4) | TeamRegistry | **Corregido** (`nonReentrant`) |
| 2 | `assembly` | TeamRegistry `_mintCredential` | **Corregido** (interfaz tipada) |
| 3 | `low-level-calls` | TeamRegistry `_mintCredential` | **Corregido** (interfaz tipada) |
| 4 | `missing-inheritance` | TeamCredential | **Corregido** (hereda `ITeamCredential`) |
| 5 | `missing-zero-check` | TeamCredential constructor | **Corregido** (revierte con `InvalidRegistry`) |
| 6 | `reentrancy-no-eth` (x2) | TeamRegistry `createTeam`, `requestJoin` | **Aceptado** |
| 7 | `reentrancy-benign` | TeamRegistry `createTeam` | **Aceptado** |

## Correcciones aplicadas

1. **`assembly` y `low-level-calls` (corregidos).** `_mintCredential` usaba una llamada de bajo
   nivel (`credential.call(...)`) más un bloque `assembly` para propagar el motivo del revert.
   Se reemplazó por una interfaz tipada `ITeamCredential`:
   `ITeamCredential(credential).mint(to, teamId)`. Una llamada de alto nivel propaga el revert
   automáticamente, por lo que el `assembly` era innecesario.

2. **`reentrancy-events` (corregido).** Slither advertía por emitir eventos después de una
   llamada externa. Se añadió el modificador `nonReentrant` (OpenZeppelin `ReentrancyGuard`) a
   las funciones con llamadas externas: `addCourseMember`, `addCourseMembers`, `createTeam`,
   `requestJoin` y `claimCredential`. `claimCredential` además ya respetaba Checks-Effects-Interactions (marca
   `application.claimed = true` antes del mint), que es lo que evita un doble reclamo aun si el
   `claimAddress` fuera un contrato malicioso que reentra vía `onERC721Received`.

3. **`missing-inheritance` (corregido).** `TeamCredential` ahora hereda explícitamente de
   `ITeamCredential` (`contract TeamCredential is ERC721, ITeamCredential`).

4. **`missing-zero-check` (corregido).** La segunda corrida, sobre el código final, detectó que
   el constructor de `TeamCredential` aceptaba la dirección cero al fijarse el registry en el
   constructor en lugar de por `setRegistry`. Se restituyó la validación: el constructor
   revierte con `InvalidRegistry` si `registry_` es la dirección cero. Hay un test que lo cubre
   (`test/TeamRegistry.guards.test.ts`).

   Nota posterior a la optimización de gas: el guard pasó de `ReentrancyGuard` a
   `ReentrancyGuardTransient` (EIP-1153). La protección es la misma, pero el estado del guard
   vive en transient storage y deja de escribir un slot de storage en cada llamada.

## Findings aceptados (con justificación)

### `reentrancy-no-eth` en `createTeam` y `requestJoin`, y `reentrancy-benign` en `createTeam`

Slither reporta escrituras de estado posteriores a la llamada externa
`semaphore.validateProof(courseGroupId, proof)`. Se aceptan por las siguientes razones:

- **El destino de la llamada es inmutable y de confianza.** `semaphore` es una variable
  `immutable` fijada en el constructor a un contrato Semaphore (PSE), una librería auditada y
  ampliamente utilizada. No es un destino controlable por el usuario.
- **No hay callback hacia `TeamRegistry`.** `Semaphore.validateProof` sólo verifica la prueba y
  quema el nullifier en su propio estado; no vuelve a llamar a este contrato, por lo que no
  existe una ruta de reentrada real.
- **Las funciones están protegidas con `nonReentrant`.** Aunque Slither no reconoce el patrón
  del guard de OpenZeppelin v5 en estos detectores, la protección existe en el código.
- **Sin transferencias de ETH** (por eso es `*-no-eth` / `benign`), no hay robo de fondos ni
  ventana de explotación.
- **No se pueden reordenar las escrituras antes de la validación:** validar primero y escribir
  después es justamente el orden seguro (evita persistir estado para pruebas inválidas).

Estos findings son informativos y no representan un problema de seguridad explotable en el
diseño actual. Quedarán resueltos de forma definitiva si en la Fase 2 se introduce un contrato
Semaphore mutable o se agregan transferencias de valor (en cuyo caso el `nonReentrant` ya
presente sigue cubriendo la superficie).

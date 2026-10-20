# TeamUp ZK — Whitepaper

## Resumen

TeamUp ZK es un protocolo on-chain para la formación de equipos entre estudiantes de un
curso. Combina un registro de membresía verificable (controlado por el docente) con pruebas
de conocimiento cero de Semaphore, para que un estudiante pueda postularse a un equipo
demostrando que pertenece al curso **sin revelar quién es**. La credencial resultante es un
NFT que el estudiante reclama en la dirección que elija, que puede ser desechable.

El MVP implementa el flujo completo: alta de miembros, creación de equipos con prueba ZK,
postulación anónima, aceptación por parte del equipo, reclamo de la credencial y revelación
final de la composición. No incluye todavía incentivos económicos ni interfaz de usuario.

## 1. El problema

Coordinar equipos dentro de un curso suele resolverse con una planilla compartida. Ese
mecanismo falla en tres frentes:

1. **No verifica identidad.** Cualquiera puede escribir cualquier nombre; no hay forma de
   comprobar que quien se anota es realmente un compañero del curso.
2. **Expone a quien busca equipo.** Buscar equipo es, muchas veces, una situación de
   vulnerabilidad (quedarse sin grupo, ser el último elegido). Publicar el interés con el
   nombre real tiene un costo social que desincentiva la participación.
3. **No deja registro verificable.** Los acuerdos viven en una conversación o en celdas de
   Excel; no hay constancia firmada de quién formó parte de qué equipo.

## 2. Por qué blockchain

La decisión de usar blockchain no es decorativa; responde a dos propiedades concretas del
problema:

- **Membresía verificable sin intermediario.** El docente es quien decide quién está en el
  curso, y esa lista vive en un contrato. Cualquier contrato o usuario puede verificar en
  cadena que una postulación proviene de un miembro del curso, sin depender de una base de
  datos privada ni de una firma offline.
- **Privacidad verificable.** Es exactamente el caso de uso de las pruebas de conocimiento
  cero: queremos *demostrar* una condición (soy del curso) sin *revelar* el dato que la
  sostiene (quién soy). Un servidor central podría ofrecer anonimato, pero obligaría a confiar
  en que no registra ni correlaciona las postulaciones. El contrato, en cambio, no tiene dónde
  guardar esa correlación porque nunca recibe la identidad.

El registro público y verificable de la composición de los equipos es un efecto secundario
deseable: al final, todos pueden comprobar que un equipo se formó y quiénes (criptográficamente)
lo integraron, sin que el proceso de formación haya expuesto a nadie.

## 3. Objetivos y modelo de amenazas

**Objetivos**

- Solo miembros del curso pueden crear equipos y postularse.
- La postulación no debe vincularse a la dirección de quien la envía.
- Una misma identidad no puede postularse dos veces al mismo equipo.
- El equipo decide a quién acepta; la credencial se entrega una sola vez por miembro.
- Todo el flujo es auditable a partir de eventos.

**Adversarios considerados**

- **Postulante no miembro.** Sin una identidad en el grupo del curso no puede generar una
  prueba válida; el contrato la rechaza.
- **Sybil.** Quien intente postularse varias veces con la misma identidad ve rechazada la
  segunda postulación: el nullifier se repite y el contrato lo detecta.
- **Tercero observador.** Ve las transacciones, pero no puede asociarlas a una identidad: los
  eventos exponen nullifiers, no direcciones.
- **Front-running del reclamo.** Un tercero podría enviar el reclamo antes que el interesado,
  pero la credencial siempre se mintea a la dirección fijada en el compromiso, así que no gana
  nada.

**Fuera de alcance (MVP)**

- Resistencia a denegación de servicio y *griefing* de mempool (ver §10).
- Incentivos económicos y penalizaciones.

## 4. Arquitectura

Tres contratos, con una separación deliberada de responsabilidades:

| Contrato | Rol |
|---|---|
| `Semaphore` (PSE, tercero) | Grupo del curso y verificación de pruebas ZK |
| `TeamRegistry` (propio) | Lógica del protocolo: equipos, postulaciones, credenciales |
| `TeamCredential` (propio, ERC-721) | Credencial de pertenencia a un equipo |

`TeamRegistry` **no hereda** de `Semaphore`, lo consume a través de la interfaz `ISemaphore`.
La razón es de seguridad: `Semaphore` expone `addMember` como función pública; si
`TeamRegistry` heredara, cualquiera podría agregar miembros al grupo del curso saltándose el
control del docente. Al usar composición y crear el grupo con `TeamRegistry` mismo como
administrador, la única puerta de entrada es `addCourseMember`, restringida al dueño del
curso.

La interacción entre contratos propios se realiza vía la interfaz `ITeamCredential`:
`TeamRegistry` mintea la credencial en `TeamCredential`, que a su vez solo acepta llamadas de
su registry registrado. Hay entonces dos interconexiones de contratos: `TeamRegistry ↔
Semaphore` y `TeamRegistry ↔ TeamCredential`.

## 5. Flujo del protocolo

1. **Alta de miembros.** El dueño del curso llama `addCourseMembers([commitments])` (o
   `addCourseMember(commitment)` de a uno) por cada estudiante. El *commitment* es la parte
   pública de la identidad Semaphore del alumno.
2. **Creación de equipo.** Un miembro genera una prueba ZK con `scope = teamId` y llama
   `createTeam`. El contrato valida la prueba contra el grupo del curso y crea el equipo con
   el creador como administrador.
3. **Postulación anónima.** Un miembro genera una prueba con `scope = teamId` y
   `message = keccak256(presentation, claimCommitment)`, y llama `requestJoin`. El contrato
   guarda la postulación **indexada por el nullifier**; no almacena `msg.sender`.
4. **Aceptación.** El administrador del equipo llama `acceptRequest(teamId, nullifier)`.
5. **Revelación.** Cuando el equipo está completo, o al pasar `revealAtBlock`, se llama
   `reveal`: se congela la composición, se emite la lista **ordenada** de nullifiers y se guarda
   `rosterRoot = keccak256(sortedNullifiers)`, un compromiso verificable del plantel.
6. **Reclamo de credencial.** Recién tras la revelación, con `claimAddress` y `salt`, el
   contrato verifica `keccak256(claimAddress, salt)` contra el compromiso y mintea el NFT a
   `claimAddress`. Puede pagar el gas cualquiera. La credencial certifica pertenencia a un
   equipo ya finalizado, no a uno que todavía podría cambiar.

## 6. Diseño criptográfico

- **Prueba de membresía.** Semaphore v4 sobre el árbol LeanIMT del grupo del curso. La prueba
  demuestra, sin revelar cuál, que el emisor conoce una identidad cuyo commitment está en el
  árbol.
- **Nullifier.** Cada prueba expone un nullifier determinista por (identidad, grupo). El
  contrato lo usa como clave de la postulación, lo que da dos garantías a la vez: identificador
  estable para aceptar/reclamar, e imposibilidad de postularse dos veces. En `createTeam` y
  `requestJoin` se usa `validateProof`, que además quema el nullifier del lado de Semaphore.
- **Mensaje autenticado.** El mensaje de la prueba es
  `keccak256(presentation, claimCommitment) mod SNARK_FIELD_SIZE`. Esto ata la carta de
  presentación y el compromiso de reclamo a la prueba: un tercero no puede alterar ninguno de
  los dos.
- **Compromiso de reclamo.** `claimCommitment = keccak256(abi.encode(claimAddress, salt))`.
  Permite fijar la dirección destino sin revelarla y evita que alguien distinto reciba la
  credencial. Se eligió keccak256 y no el circuito de *ownership* de Semaphore porque este
  último solo existe en el repositorio experimental de PSE, no en el SDK estable.

## 7. Seguridad

- **Checks-Effects-Interactions.** En `claimCredential` la marca `application.claimed = true`
  se escribe antes del mint, de modo que una reentrada (posible vía `onERC721Received` si
  `claimAddress` fuera un contrato) no puede reclamar dos veces.
- **ReentrancyGuard.** Las funciones con llamadas externas (`addCourseMember`,
  `addCourseMembers`, `createTeam`, `requestJoin`, `claimCredential`) están protegidas con
  `nonReentrant` de OpenZeppelin, en su variante transient (EIP-1153).
- **Control de acceso.** `Ownable` en `TeamRegistry`. `addCourseMember`,
  `addCourseMembers` y `setCredential` son del dueño del curso; `acceptRequest` es del
  administrador del equipo; `mint` de la credencial solo lo puede llamar el registry, cuya
  dirección queda fijada en el constructor de la credencial.
- **Errores custom** en lugar de strings, y **eventos** para cada transición de estado.
- **Sin `tx.origin`, `delegatecall` ni `selfdestruct`.** La única llamada externa relevante es
  a contratos de confianza (Semaphore inmutable, `TeamCredential` propio).
- **Análisis estático (Slither 0.11.6).** Se corrigieron los findings accionables
  (calls de bajo nivel, `assembly`, herencia de interfaz) y los restantes quedaron
  identificados y justificados en [`security/slither-report.md`](security/slither-report.md).

## 8. Eficiencia y gas

- `semaphore`, `courseGroupId`, `SNARK_FIELD_SIZE` y el `registry` de la credencial son
  `immutable` / `constant`.
- El `Team` empaqueta `admin`, `maxMembers` y `revealAtBlock` en un solo slot de storage, y el
  estado "revelado" se deriva de `rosterRoot` en lugar de un bool que puede desincronizarse.
- Se cachean lecturas de storage repetidas (por ejemplo la longitud de miembros al revelar).
- Se usa `unchecked` en incrementos que no pueden desbordar (`teamCounter`, `_nextTokenId`).
- Se usan `calldata` para los parámetros externos y `memory` solo donde corresponde.
- El guard de reentrada usa transient storage, así que no escribe un slot de storage por
  llamada.
- `addCourseMembers` inscribe a varios alumnos en una sola transacción.
- El stack de Semaphore (verificador, PoseidonT3 y Semaphore) se despliega una vez y se
  reutiliza: el verificador y la librería no tienen estado, y cada registry crea su propio
  grupo.
- Optimizador de Solidity activado (200 corridas), sin metadata CBOR para achicar el código
  desplegado.
- Medición completa antes y después de cada cambio en
  [`contracts/GAS-OPTIMIZATION-REPORT.md`](contracts/GAS-OPTIMIZATION-REPORT.md).

## 9. Testing y análisis estático

- **32 tests** de Mocha que cubren el flujo principal y todos los reverts relevantes:
  no-miembro, doble postulación, mensaje alterado, claim con salt incorrecto, claim antes de
  aceptar, claim antes de revelar, reveal prematuro, equipo lleno, root del plantel
  determinista, y que la postulación nunca queda ligada al emisor.
- **Coverage (`pnpm run coverage`)**: 87.9% de líneas y 89.1% de statements sobre el código
  propio (`solidity-coverage` no desglosa ramas ni funciones).
- **Slither** sobre `TeamRegistry` y `TeamCredential` con las dependencias externas excluidas.

## 10. Limitaciones del MVP

- **Anonimato estadístico, no absoluto.** Grupos muy chicos (1-2 miembros) no ofrecen
  anonimato real; es una advertencia documentada por el propio Semaphore.
- **El emisor de la transacción es público en el bloque.** Para ocultarlo del todo hace falta
  un relayer; el contrato no lo necesita, pero la red sí lo ve.
- **Posible *griefing* en el mempool.** Alguien podría copiar una prueba vista en el mempool y
  minarla antes, quemando el nullifier de la víctima para ese equipo. En desarrollo no aplica;
  en producción se mitiga con relayers privados.
- **Sin incentivos.** No hay staking ni penalizaciones; el abandono de un equipo no tiene costo.

## 11. Roadmap

| Fase | Función / mejora | Motivo |
|---|---|---|
| 2 | Staking y slashing | Que abandonar un equipo tenga costo; el voto de slashing lo ejerce el equipo |
| 2 | Relayer | Ocultar el emisor de la transacción y eliminar el griefing |
| 3 | Reclutamiento ciego | Aceptar por nullifier y revelar recién al reclamar, con el circuito de ownership de Semaphore cuando salga del laboratorio |
| 3 | Reputación acumulativa | Credenciales por participación, sin exponer puntuaciones públicas |
| 4 | Interfaz web | Panel Next.js + wagmi para operar el protocolo contra testnet sin scripts |
| 4 | Matching off-chain | Filtros por skills/roles alimentados por eventos (subgraph) |

## 12. Stack técnico

Solidity 0.8.28 · Hardhat 3 · ethers v6 · OpenZeppelin Contracts 5 · Semaphore V4
(contracts/identity/group/proof) · TypeScript (ESM) · Mocha · Slither.

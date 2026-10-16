# TeamUp ZK

Formación de equipos con membresía verificable. Los estudiantes demuestran con una **prueba de conocimiento cero (Semaphore V4)** que pertenecen al curso y se postulan a equipos **sin revelar su identidad**: la postulación se registra por un **nullifier** (seudónimo criptográfico), no por una dirección. Al ser aceptados reciben una **credencial NFT**.

Un defecto de la planilla compartida: no verifica nada, no impide postularse dos veces con identidades distintas y no deja un registro verificable. TeamUp ZK reemplaza la planilla por un protocolo on-chain.

## Estructura del repositorio

```
.
├── contracts/     Protocolo Solidity + tests, coverage, Slither y scripts de deploy
├── frontend/      App Next.js 16 + wagmi 3 con pruebas ZK generadas en el navegador
├── WHITEPAPER.md  Problema, modelo de amenazas, diseño y roadmap
└── README.md
```

- **`contracts/`** — `TeamRegistry` (lógica), `TeamCredential` (ERC721) y todo el tooling Hardhat. Guía completa en [`contracts/README.md`](contracts/README.md).
- **`frontend/`** — interfaz para operar el protocolo contra localhost o Sepolia. Guía completa en [`frontend/README.md`](frontend/README.md).

## Inicio rápido

### 1. Contratos

```bash
cd contracts
npm install
npx hardhat test          # 26 tests
npx hardhat test --coverage
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # completar direcciones y RPC
npm run dev                  # http://localhost:3000
```

## Demo local completa (para el video)

Levanta una red local, despliega el protocolo, genera actividad on-chain y abre la interfaz.

```bash
# terminal 1 — red local
cd contracts
npm install
npm run node

# terminal 2 — deploy + interacción (imprime el hash de cada tx)
cd contracts
npm run deploy:localhost
npm run interact:localhost          # crea un equipo, postula, acepta, reclama y revela
npm run export:abis                 # refresca los ABIs que usa el frontend

# terminal 3 — frontend apuntando a localhost
cd frontend
npm install
# copiar de contracts/deployments/localhost.json:
#   teamRegistry -> NEXT_PUBLIC_REGISTRY_ADDRESS
#   teamCredential -> NEXT_PUBLIC_CREDENTIAL_ADDRESS
#   semaphore -> NEXT_PUBLIC_SEMAPHORE_ADDRESS
npm run dev
```

En el navegador, conectá MetaMask a `localhost:31337` (Chain ID 31337). Para la demo con dos roles, usá **dos navegadores/perfiles** con dos cuentas de Hardhat (una como docente/owner, otra como alumno).

## Cómo funciona, en una línea

El docente agrega los commitments de los alumnos al grupo del curso; un alumno **crea un equipo** o **se postula** adjuntando un proof ZK de membresía; el equipo acepta por **nullifier** y el alumno reclama su **credencial NFT** a la dirección que elija (puede ser desechable).

Detalle completo, decisiones de diseño y limitaciones en [`WHITEPAPER.md`](WHITEPAPER.md) y [`contracts/README.md`](contracts/README.md).

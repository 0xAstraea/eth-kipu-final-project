import hre from "hardhat";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/// Library link key required to deploy the Semaphore contract.
const POSEIDON_LINK_KEY = "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3";

const connection = await hre.network.create();
const { ethers } = connection;

interface StackRecord {
  semaphore?: string;
  semaphoreVerifier?: string;
  poseidonT3?: string;
}

/// Addresses of the shared Semaphore stack, one record per network.
/// The verifier and the poseidon library hold no state, and the Semaphore contract keeps
/// only group state, so a deployed stack is reused by every later deployment. This file
/// is the canonical record of that stack. It is written by this script on first deploy.
const STACK_PATH = join(process.cwd(), "deploy", "semaphore-stack.json");

/// Deploys the full TeamUp ZK protocol to the selected network and writes the
/// deployed addresses to deployments/<network>.json.
///
/// Usage:
///   npx hardhat run deploy/deploy.ts --network sepolia
///
/// Optional env:
///   COURSE_MEMBERS  comma-separated identity commitments to enroll at deploy time.
///   OWNER_ADDRESS   address that becomes the course owner (e.g. your MetaMask account).
///                   On localhost it is also funded with 10 ETH.
///   SEMAPHORE_ADDRESS, SEMAPHORE_VERIFIER_ADDRESS, POSEIDON_T3_ADDRESS
///                   override the recorded Semaphore stack for this deployment.
async function main() {
  const networkName = connection.networkName;
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`Deploying TeamUp ZK to '${networkName}' (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const stack = resolveStack(networkName);
  const semaphore = await resolveSemaphoreStack(stack);

  const registry: any = await ethers.deployContract("TeamRegistry", [semaphore.semaphore]);
  await registry.waitForDeployment();
  console.log(`TeamRegistry       : ${await registry.getAddress()}`);

  const credential: any = await ethers.deployContract("TeamCredential", [await registry.getAddress()]);
  await credential.waitForDeployment();
  console.log(`TeamCredential     : ${await credential.getAddress()}`);

  await (await registry.connect(deployer).setCredential(await credential.getAddress())).wait();
  console.log("Wired TeamRegistry <-> TeamCredential");

  const courseMembers = (process.env.COURSE_MEMBERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (courseMembers.length > 0) {
    const tx = await registry.addCourseMembers(courseMembers.map((value) => BigInt(value)));
    await tx.wait();
    console.log(`Enrolled ${courseMembers.length} course member(s) in one transaction`);
    for (const commitment of courseMembers) {
      console.log(`Enrolled course member commitment: ${commitment}`);
    }
  }

  // Optionally hand the course ownership to another account (e.g. a MetaMask account
  // used in the frontend demo), so no deployer private key has to be imported.
  const ownerAddress = (process.env.OWNER_ADDRESS ?? "").trim();
  let courseOwner = deployer.address;
  if (ownerAddress && ownerAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    if (networkName === "localhost" || networkName === "hardhat" || networkName === "default") {
      const fundTx = await deployer.sendTransaction({ to: ownerAddress, value: ethers.parseEther("10") });
      await fundTx.wait();
      console.log(`Funded course owner ${ownerAddress} with 10 ETH -> ${fundTx.hash}`);
    }
    const transferTx = await registry.transferOwnership(ownerAddress);
    await transferTx.wait();
    console.log(`Transferred TeamRegistry ownership to ${ownerAddress} -> ${transferTx.hash}`);
    courseOwner = ownerAddress;
  }

  const addresses = {
    network: networkName,
    chainId: chainId.toString(),
    deployer: deployer.address,
    owner: courseOwner,
    semaphoreVerifier: semaphore.semaphoreVerifier,
    poseidonT3: semaphore.poseidonT3,
    semaphore: semaphore.semaphore,
    teamCredential: await credential.getAddress(),
    teamRegistry: await registry.getAddress(),
    courseGroupId: (await registry.courseGroupId()).toString(),
    enrolledMembers: courseMembers,
    deployedAt: new Date().toISOString()
  };

  const dir = join(process.cwd(), "deployments");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${networkName}.json`);
  writeFileSync(file, JSON.stringify(addresses, null, 2));

  console.log(`\nAddresses saved to ${file}`);
  console.log(JSON.stringify(addresses, null, 2));
}

/// Reads the recorded Semaphore stack for a network and lets the environment override it.
/// The canonical record is deploy/semaphore-stack.json. The previous deployment record
/// of the same network is a second source, which is what makes repeated local
/// deployments reuse the stack.
function resolveStack(networkName: string): StackRecord {
  let recorded: StackRecord = {};
  if (existsSync(STACK_PATH)) {
    const all = JSON.parse(readFileSync(STACK_PATH, "utf8"));
    recorded = all[networkName] ?? {};
  }

  const previousPath = join(process.cwd(), "deployments", `${networkName}.json`);
  let previous: StackRecord = {};
  if (existsSync(previousPath)) {
    const file = JSON.parse(readFileSync(previousPath, "utf8"));
    previous = {
      semaphore: file.semaphore,
      semaphoreVerifier: file.semaphoreVerifier,
      poseidonT3: file.poseidonT3
    };
  }

  const fromEnv: StackRecord = {
    semaphore: process.env.SEMAPHORE_ADDRESS,
    semaphoreVerifier: process.env.SEMAPHORE_VERIFIER_ADDRESS,
    poseidonT3: process.env.POSEIDON_T3_ADDRESS
  };

  const merged: StackRecord = { ...previous, ...recorded };
  for (const [key, value] of Object.entries(fromEnv)) {
    if (value && value.trim().length > 0) merged[key as keyof StackRecord] = value.trim();
  }
  for (const [key, value] of Object.entries(merged)) {
    if (!value || value.trim().length === 0) delete merged[key as keyof StackRecord];
  }
  return merged;
}

/// Reuses the recorded Semaphore stack when its code is still on chain, and deploys
/// the missing pieces otherwise. A reused stack costs no gas at all.
async function resolveSemaphoreStack(stack: StackRecord) {
  if (stack.semaphore && (await hasCode(stack.semaphore))) {
    console.log(`Semaphore          : ${stack.semaphore} (reused)`);
    console.log(`SemaphoreVerifier  : ${stack.semaphoreVerifier ?? "n/a (reused stack)"}`);
    console.log(`PoseidonT3         : ${stack.poseidonT3 ?? "n/a (reused stack)"}`);
    return stack;
  }

  let verifierAddress = stack.semaphoreVerifier;
  if (!verifierAddress || !(await hasCode(verifierAddress))) {
    const verifier = await ethers.deployContract("SemaphoreVerifier");
    await verifier.waitForDeployment();
    verifierAddress = await verifier.getAddress();
    console.log(`SemaphoreVerifier  : ${verifierAddress} (deployed)`);
  } else {
    console.log(`SemaphoreVerifier  : ${verifierAddress} (reused)`);
  }

  let poseidonAddress = stack.poseidonT3;
  if (!poseidonAddress || !(await hasCode(poseidonAddress))) {
    const poseidonT3 = await ethers.deployContract("PoseidonT3");
    await poseidonT3.waitForDeployment();
    poseidonAddress = await poseidonT3.getAddress();
    console.log(`PoseidonT3         : ${poseidonAddress} (deployed)`);
  } else {
    console.log(`PoseidonT3         : ${poseidonAddress} (reused)`);
  }

  const semaphoreFactory = await ethers.getContractFactory("Semaphore", {
    libraries: { [POSEIDON_LINK_KEY]: poseidonAddress }
  });
  const semaphore = await semaphoreFactory.deploy(verifierAddress);
  await semaphore.waitForDeployment();
  const semaphoreAddress = await semaphore.getAddress();
  console.log(`Semaphore          : ${semaphoreAddress} (deployed)`);

  const record: StackRecord = {
    semaphore: semaphoreAddress,
    semaphoreVerifier: verifierAddress,
    poseidonT3: poseidonAddress
  };
  saveStack(connection.networkName, record);

  return record;
}

/// Tells whether an address holds contract code on the target network.
async function hasCode(address: string): Promise<boolean> {
  if (!address) return false;
  try {
    const code = await ethers.provider.getCode(address);
    return code !== "0x" && code.length > 2;
  } catch {
    return false;
  }
}

/// Records the Semaphore stack so the next deployment reuses it. Local networks are
/// ephemeral, so their record lives in the git-ignored deployments file instead.
function saveStack(networkName: string, record: StackRecord) {
  if (networkName === "localhost" || networkName === "hardhat" || networkName === "default") {
    return;
  }

  let all: Record<string, StackRecord> = {};
  if (existsSync(STACK_PATH)) {
    all = JSON.parse(readFileSync(STACK_PATH, "utf8"));
  }
  all[networkName] = record;
  mkdirSync(join(STACK_PATH, ".."), { recursive: true });
  writeFileSync(STACK_PATH, JSON.stringify(all, null, 2));
  console.log(`Semaphore stack recorded in ${STACK_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

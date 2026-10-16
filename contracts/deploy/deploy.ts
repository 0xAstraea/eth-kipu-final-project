import hre from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/// Library link key required to deploy the Semaphore contract.
const POSEIDON_LINK_KEY = "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3";

const connection = await hre.network.create();
const { ethers } = connection;

/// Deploys the full TeamUp ZK protocol to the selected network and writes the
/// deployed addresses to deployments/<network>.json.
///
/// Usage:
///   npx hardhat run deploy/deploy.ts --network sepolia
///
/// Optional env:
///   COURSE_MEMBERS  comma-separated identity commitments to enroll at deploy time.
async function main() {
  const networkName = connection.networkName;
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`Deploying TeamUp ZK to '${networkName}' (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const verifier = await ethers.deployContract("SemaphoreVerifier");
  await verifier.waitForDeployment();
  console.log(`SemaphoreVerifier  : ${await verifier.getAddress()}`);

  const poseidonT3 = await ethers.deployContract("PoseidonT3");
  await poseidonT3.waitForDeployment();
  console.log(`PoseidonT3         : ${await poseidonT3.getAddress()}`);

  const semaphoreFactory = await ethers.getContractFactory("Semaphore", {
    libraries: { [POSEIDON_LINK_KEY]: await poseidonT3.getAddress() }
  });
  const semaphore = await semaphoreFactory.deploy(await verifier.getAddress());
  await semaphore.waitForDeployment();
  console.log(`Semaphore          : ${await semaphore.getAddress()}`);

  const credential = await ethers.deployContract("TeamCredential");
  await credential.waitForDeployment();
  console.log(`TeamCredential     : ${await credential.getAddress()}`);

  const registry = await ethers.deployContract("TeamRegistry", [await semaphore.getAddress()]);
  await registry.waitForDeployment();
  console.log(`TeamRegistry       : ${await registry.getAddress()}`);

  await (await credential.setRegistry(await registry.getAddress())).wait();
  await (await registry.setCredential(await credential.getAddress())).wait();
  console.log("Wired TeamRegistry <-> TeamCredential");

  const courseMembers = (process.env.COURSE_MEMBERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  for (const commitment of courseMembers) {
    await (await registry.addCourseMember(BigInt(commitment))).wait();
    console.log(`Enrolled course member commitment: ${commitment}`);
  }

  const addresses = {
    network: networkName,
    chainId: chainId.toString(),
    deployer: deployer.address,
    semaphoreVerifier: await verifier.getAddress(),
    poseidonT3: await poseidonT3.getAddress(),
    semaphore: await semaphore.getAddress(),
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

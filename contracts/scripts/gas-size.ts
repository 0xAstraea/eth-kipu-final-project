// Prints the deployed bytecode size of our contracts, for code-size experiments.
// Usage: npx hardhat run scripts/gas-size.ts
import hre from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await hre.network.create();

for (const name of ["TeamRegistry", "TeamCredential"]) {
  const artifact = JSON.parse(
    readFileSync(join(process.cwd(), "artifacts", "contracts", `${name}.sol`, `${name}.json`), "utf8")
  );
  const bytes = (artifact.deployedBytecode.length - 2) / 2;
  console.log(`${name}: ${bytes} bytes, code deposit ${(bytes * 200).toLocaleString("en-US")} gas`);
}

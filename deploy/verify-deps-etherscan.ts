/**
 * Verify Semaphore stack on Etherscan API v2 (Standard JSON, no-CBOR settings).
 * Bypasses Hardhat HHE80005.
 *
 *   pnpm exec hardhat run deploy/verify-deps-etherscan.ts --network sepolia
 */
import hre from "hardhat";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Interface } from "ethers";

const connection = await hre.network.create();
const CHAIN_ID = 11155111;
const SOLC = "v0.8.28+commit.7893614a";

async function main() {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error("ETHERSCAN_API_KEY missing");

  const statePath = join(process.cwd(), "deployments", `${connection.networkName}.json`);
  if (!existsSync(statePath)) throw new Error(`Missing ${statePath}`);
  const state = JSON.parse(readFileSync(statePath, "utf8"));

  await hre.tasks.getTask("compile").run({});

  const poseidon = resolveBuild("/PoseidonT3.sol", true, true);
  const verifier = resolveBuild("/base/SemaphoreVerifier.sol", true, true);
  const semaphore = resolveBuild("/Semaphore.sol", true, false);

  const jobs = [
    {
      label: "PoseidonT3",
      address: state.poseidonT3 as string,
      contractName: `${poseidon.sourcePath}:PoseidonT3`,
      input: poseidon.input,
      ctor: ""
    },
    {
      label: "SemaphoreVerifier",
      address: state.semaphoreVerifier as string,
      contractName: `${verifier.sourcePath}:SemaphoreVerifier`,
      input: verifier.input,
      ctor: ""
    },
    {
      label: "Semaphore",
      address: state.semaphore as string,
      contractName: `${semaphore.sourcePath}:Semaphore`,
      input: semaphore.input,
      ctor: new Interface(["constructor(address)"]).encodeDeploy([state.semaphoreVerifier]).slice(2),
      libraryName: "PoseidonT3",
      libraryAddress: state.poseidonT3 as string
    }
  ];

  for (const job of jobs) {
    console.log(`\n=== ${job.label} ${job.address} ===`);

    const input = JSON.parse(JSON.stringify(job.input));
    if (input.settings?.outputSelection) {
      input.settings.outputSelection = {
        "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] }
      };
    }

    const body = new URLSearchParams({
      module: "contract",
      action: "verifysourcecode",
      contractaddress: job.address,
      sourceCode: JSON.stringify(input),
      codeformat: "solidity-standard-json-input",
      contractname: job.contractName,
      compilerversion: SOLC,
      constructorArguements: job.ctor
    });
    if (job.libraryName && job.libraryAddress) {
      body.set("libraryname1", job.libraryName);
      body.set("libraryaddress1", job.libraryAddress);
    }

    const submit = await post(apiKey, body);
    console.log("submit:", submit.status, submit.message, submit.result);
    if (submit.status !== "1") {
      if (String(submit.result).toLowerCase().includes("already verified")) {
        console.log("Already verified.");
      }
      continue;
    }

    const guid = submit.result;
    for (let i = 0; i < 24; i++) {
      await sleep(5000);
      const status = await getStatus(apiKey, guid);
      console.log(`poll[${i}]:`, status.status, status.result);
      const r = String(status.result).toLowerCase();
      if (r.includes("pass") || r.includes("already") || r.includes("fail")) break;
    }
    console.log(`https://sepolia.etherscan.io/address/${job.address}#code`);
  }
}

function resolveBuild(fileSuffix: string, requireNoCbor: boolean, preferSmall: boolean) {
  const dir = join(process.cwd(), "artifacts", "build-info");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".output.json"));
  const candidates: { file: string; input: unknown; sourcePath: string; size: number }[] = [];
  for (const file of files) {
    const info = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const sources: Record<string, unknown> = info.input?.sources ?? {};
    const sourcePath = Object.keys(sources).find((k) => k.endsWith(fileSuffix));
    if (!sourcePath) continue;
    const meta = info.input?.settings?.metadata;
    const noCbor = meta?.appendCBOR === false || meta?.bytecodeHash === "none";
    if (requireNoCbor && !noCbor) continue;
    candidates.push({
      file,
      input: info.input,
      sourcePath,
      size: Object.keys(sources).length
    });
  }
  if (candidates.length === 0) {
    throw new Error(`No build-info found for *${fileSuffix}*`);
  }
  candidates.sort((a, b) => (preferSmall ? a.size - b.size : b.size - a.size));
  const best = candidates[0];
  console.log(`using build-info ${best.file} → ${best.sourcePath} (${best.size} sources)`);
  return { input: best.input, sourcePath: best.sourcePath };
}

function apiUrl(apiKey: string): string {
  // chainid MUST be a query param on v2 (otherwise Etherscan looks at the wrong chain).
  return `https://api.etherscan.io/v2/api?chainid=${CHAIN_ID}&apikey=${encodeURIComponent(apiKey)}`;
}

async function post(apiKey: string, body: URLSearchParams) {
  const res = await fetch(apiUrl(apiKey), { method: "POST", body });
  return (await res.json()) as { status: string; message: string; result: string };
}

async function getStatus(apiKey: string, guid: string) {
  const url = new URL(apiUrl(apiKey));
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "checkverifystatus");
  url.searchParams.set("guid", guid);
  const res = await fetch(url);
  return (await res.json()) as { status: string; result: string };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

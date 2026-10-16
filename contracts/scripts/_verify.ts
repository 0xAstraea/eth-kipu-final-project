import hre from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const connection = await hre.network.create();
const { ethers } = connection;

const state = JSON.parse(readFileSync(join(process.cwd(), "deployments", "localhost.json"), "utf8"));
const registry: any = await ethers.getContractAt("TeamRegistry", state.teamRegistry);
const owner = state.owner as string;

const teamId = 1n;
const nullifier = 1313502986676223756943166340777568890537916596071638851064738324343252067616n;
const claimAddress = "0x01BE2966b319F9A4177db48cc8cd101922a57aeA";
const salt = 274448261761605238529862823985759894061n;

const provider = ethers.provider;
await provider.send("hardhat_impersonateAccount", [owner]);
const ownerSigner = await ethers.getSigner(owner);

const accept = await registry.connect(ownerSigner).acceptRequest(teamId, nullifier);
await accept.wait();
console.log("accepted. members:", (await registry.getTeamMembers(teamId)).map((m: bigint) => m.toString()));
console.log("application:", await registry.getApplication(teamId, nullifier));

await provider.send("hardhat_stopImpersonatingAccount", [owner]);

try {
  await registry.claimCredential.staticCall(teamId, nullifier, claimAddress, salt);
  console.log("claimCredential STATIC CALL: OK");
} catch (err: any) {
  console.log("claimCredential REVERTED:", err.shortMessage ?? err.message);
}

process.exit(0);

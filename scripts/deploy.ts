import hre from "hardhat";
import {
  ProtocolState,
  claimCommitmentOf,
  deployProtocolForDemo,
  saveState
} from "./lib/protocol";

/// Deploys the protocol and persists the addresses + student identities.
/// Run against a persistent node for the numbered flow:
///   npx hardhat node          (terminal 1)
///   npx hardhat run scripts/deploy.ts --network localhost  (terminal 2)
const connection = await hre.network.create();
const { ethers } = connection;

async function main() {
  const signers = await ethers.getSigners();
  const protocol = await deployProtocolForDemo(signers, ethers);

  const identities = Object.fromEntries(
    Object.entries(protocol.identities).map(([name, identity]) => [name, identity.toString()])
  );
  const commitments = Object.fromEntries(
    Object.entries(protocol.identities).map(([name, identity]) => [name, identity.commitment.toString()])
  );

  const state: ProtocolState = {
    semaphore: await protocol.semaphore.getAddress(),
    credential: await protocol.credential.getAddress(),
    registry: await protocol.registry.getAddress(),
    groupId: protocol.groupId.toString(),
    identities,
    commitments,
    teamIds: []
  };
  saveState(state);

  console.log("Protocol deployed and state saved.");
  console.log(state);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

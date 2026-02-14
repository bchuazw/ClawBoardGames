/**
 * Keeper: Replenish open games so there are always TARGET_OPEN_COUNT (default 10) open games.
 * Run: SETTLEMENT_ADDRESS=0x... npx hardhat run script/KeeperReplenishOpenGames.ts --network bscTestnet
 * Env: SETTLEMENT_ADDRESS (required), TARGET_OPEN_COUNT (default 10), DEPLOYER_KEY or KEEPER_PRIVATE_KEY for the wallet with gas.
 */

import { ethers } from "hardhat";

const TARGET_OPEN_COUNT = parseInt(process.env.TARGET_OPEN_COUNT || "10", 10);

async function main() {
  const settlementAddress = process.env.SETTLEMENT_ADDRESS;
  if (!settlementAddress) {
    throw new Error("SETTLEMENT_ADDRESS env var is required");
  }

  const [keeper] = await ethers.getSigners();
  console.log("Keeper address:", keeper.address);

  const settlement = await ethers.getContractAt(
    "MonopolySettlement",
    settlementAddress,
    keeper
  );

  const openIds = await settlement.getOpenGameIds();
  const current = openIds.length;
  console.log("Current open games:", current);
  console.log("Target open games:", TARGET_OPEN_COUNT);

  if (current >= TARGET_OPEN_COUNT) {
    console.log("No replenishment needed.");
    return;
  }

  const toCreate = TARGET_OPEN_COUNT - current;
  console.log("Creating", toCreate, "open game(s)...");

  for (let i = 0; i < toCreate; i++) {
    const tx = await settlement.createOpenGame();
    const receipt = await tx.wait();
    console.log("  createOpenGame tx:", receipt?.hash);
  }

  const openIdsAfter = await settlement.getOpenGameIds();
  console.log("Open games after replenishment:", openIdsAfter.length);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

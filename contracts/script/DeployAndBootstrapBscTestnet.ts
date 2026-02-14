/**
 * Deploy CLAW + MonopolySettlement to BNB Testnet and create 10 open games.
 * Writes scripts/bsc-testnet-deploy-state.json for GM and frontend config.
 *
 * Prerequisite: DEPLOYER_KEY env set (wallet with tBNB on BNB Testnet).
 * Run: DEPLOYER_KEY=0x... npx hardhat run script/DeployAndBootstrapBscTestnet.ts --network bscTestnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const OPEN_GAME_COUNT = 10;
const STATE_PATH = path.join(__dirname, "../../scripts/bsc-testnet-deploy-state.json");
const RPC_URL = process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545";

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  console.log("Deploying with:", deployerAddr);

  const platformFeeAddr = process.env.PLATFORM_FEE_ADDR || deployerAddr;
  const gmSignerAddr = process.env.GM_SIGNER_ADDR || deployerAddr;

  // 1. Deploy CLAWToken
  const CLAWFactory = await ethers.getContractFactory("CLAWToken");
  const clawToken = await CLAWFactory.deploy(deployerAddr);
  await clawToken.waitForDeployment();
  const clawAddr = await clawToken.getAddress();
  console.log("CLAWToken deployed:", clawAddr);

  // 2. Deploy MonopolySettlement
  const SettlementFactory = await ethers.getContractFactory("MonopolySettlement");
  const settlement = await SettlementFactory.deploy(platformFeeAddr, gmSignerAddr, clawAddr);
  await settlement.waitForDeployment();
  const settlementAddr = await settlement.getAddress();
  console.log("MonopolySettlement deployed:", settlementAddr);

  // 3. Authorize Settlement as CLAW minter
  await (await clawToken.setMinter(settlementAddr, true)).wait();
  console.log("Settlement authorized as CLAW minter");

  // 4. Create open games
  console.log("Creating", OPEN_GAME_COUNT, "open games...");
  for (let i = 0; i < OPEN_GAME_COUNT; i++) {
    const tx = await settlement.createOpenGame();
    await tx.wait();
  }
  const openIds = await settlement.getOpenGameIds();
  console.log("Open game IDs:", openIds.map((id: bigint) => Number(id)).join(", "));

  // 5. Write state for GM / frontend
  const state = {
    settlementAddress: settlementAddr,
    clawAddress: clawAddr,
    rpcUrl: RPC_URL,
    deployerAddress: deployerAddr,
    openGameCount: openIds.length,
    createdAt: new Date().toISOString(),
  };
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  console.log("State written to:", STATE_PATH);

  console.log("\n=== Deployment Summary ===");
  console.log("CLAWToken:", clawAddr);
  console.log("MonopolySettlement:", settlementAddr);
  console.log("Platform / GM Signer:", deployerAddr);
  console.log("Open games:", openIds.length);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

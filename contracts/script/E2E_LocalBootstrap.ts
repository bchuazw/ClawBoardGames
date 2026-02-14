/**
 * E2E Local Bootstrap
 * ===================
 * Deploys contracts to a local Hardhat node and creates 10 open games.
 * Use with: npx hardhat run script/E2E_LocalBootstrap.ts --network localhost
 *
 * Prerequisite: run `npx hardhat node` in another terminal.
 *
 * Writes scripts/e2e-state.json with addresses for the E2E orchestrator.
 * Agent/GM keys are the standard Hardhat mnemonic (accounts 0–4).
 * E2E agents get open game IDs and pick one to deposit, reveal, and play.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const E2E_STATE_PATH = path.join(__dirname, "../../scripts/e2e-state.json");

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const deployerAddr = await deployer.getAddress();
  const players = signers.slice(1, 5);
  const playerAddrs = await Promise.all(players.map((p) => p.getAddress())) as [string, string, string, string];

  console.log("\n==============================================");
  console.log("  CLAWBOARDGAMES — LOCAL E2E BOOTSTRAP");
  console.log("==============================================\n");
  console.log("Deployer (GM):", deployerAddr);
  console.log("Players:      ", playerAddrs.map((a) => a.slice(0, 14) + "...").join(", "));

  // Deploy CLAWToken
  const CLAWFactory = await ethers.getContractFactory("CLAWToken");
  const clawToken = await CLAWFactory.deploy(deployerAddr);
  await clawToken.waitForDeployment();
  const clawAddr = await clawToken.getAddress();

  // Deploy MonopolySettlement (deployer = platform = GM)
  const SettlementFactory = await ethers.getContractFactory("MonopolySettlement");
  const settlement = await SettlementFactory.deploy(deployerAddr, deployerAddr, clawAddr);
  await settlement.waitForDeployment();
  const settlementAddr = await settlement.getAddress();

  await (await clawToken.setMinter(settlementAddr, true)).wait();

  // Create 10 open games so agents can join (getOpenGameIds → pick one → deposit, reveal, play)
  const openCount = 10;
  for (let i = 0; i < openCount; i++) {
    const tx = await settlement.createOpenGame();
    await tx.wait();
  }
  console.log(`Created ${openCount} open games (IDs 0..${openCount - 1}).`);

  const state = {
    settlementAddress: settlementAddr,
    clawAddress: clawAddr,
    rpcUrl: "http://127.0.0.1:8545",
    gmAddress: deployerAddr,
    playerAddresses: playerAddrs,
    mnemonic: "test test test test test test test test test test test junk",
  };

  const outDir = path.dirname(E2E_STATE_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(E2E_STATE_PATH, JSON.stringify(state, null, 2), "utf8");

  console.log("\n--- Deployment complete ---");
  console.log("CLAWToken:         ", clawAddr);
  console.log("MonopolySettlement:", settlementAddr);
  console.log(`${openCount} open games created (getOpenGameIds → pick one → deposit, reveal, play).`);
  console.log("State written to:  ", E2E_STATE_PATH);
  console.log("\nNext: start GM with the env below, then run the E2E players script.");
  console.log("\n  SETTLEMENT_ADDRESS=" + settlementAddr);
  console.log("  RPC_URL=" + state.rpcUrl);
  console.log("  GM_PRIVATE_KEY=<account 0 key from Hardhat node output>");
  console.log("  PORT=3001");
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

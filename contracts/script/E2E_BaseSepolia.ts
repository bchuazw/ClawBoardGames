/**
 * E2E Base Sepolia Test Script
 * ==============================
 * Deploys contracts to Base Sepolia and runs a full game lifecycle.
 *
 * Prerequisites:
 *   - DEPLOYER_KEY env var set to a private key with Base Sepolia ETH (~0.01 ETH)
 *   - Base Sepolia RPC accessible (defaults to https://sepolia.base.org)
 *
 * Usage:
 *   npx hardhat run script/E2E_BaseSepolia.ts --network baseSepolia
 *
 * The deployer key is used as: deployer, GM signer, platform fee recipient, AND
 * derives 4 agent wallets (funded from deployer).
 */

import { ethers } from "hardhat";

// Import the actual game engine
import { MonopolyEngine, GameAction, GameEvent } from "../../packages/engine/dist/index.js";

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const provider = deployer.provider!;

  console.log("\n==============================================");
  console.log("  CLAWBOARDGAMES — BASE SEPOLIA E2E TEST");
  console.log("==============================================\n");
  console.log(`Deployer:  ${deployerAddr}`);
  console.log(`Network:   Base Sepolia`);
  console.log(`Balance:   ${ethers.formatEther(await provider.getBalance(deployerAddr))} ETH`);

  // ========== Generate 4 Agent Wallets ==========
  console.log("\n--- Generating agent wallets ---");
  const agents: { wallet: ethers.Wallet; secret: Uint8Array; secretHash: string }[] = [];

  for (let i = 0; i < 4; i++) {
    const wallet = ethers.Wallet.createRandom().connect(provider);
    const secret = ethers.randomBytes(32);
    const secretHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));
    agents.push({ wallet, secret, secretHash });
    console.log(`  Agent ${i}: ${wallet.address}`);
  }

  const playerAddrs = agents.map(a => a.wallet.address) as [string, string, string, string];

  // ========== Fund Agent Wallets ==========
  console.log("\n--- Funding agent wallets (0.002 ETH each) ---");
  const fundAmount = ethers.parseEther("0.002"); // 0.001 entry + 0.001 gas buffer

  for (let i = 0; i < 4; i++) {
    const tx = await deployer.sendTransaction({
      to: agents[i].wallet.address,
      value: fundAmount,
    });
    await tx.wait();
    const bal = await provider.getBalance(agents[i].wallet.address);
    console.log(`  Agent ${i} funded: ${ethers.formatEther(bal)} ETH`);
  }

  // ========== Deploy Contracts ==========
  console.log("\n--- Deploying CLAWToken ---");
  const CLAWFactory = await ethers.getContractFactory("CLAWToken");
  const clawToken = await CLAWFactory.deploy(deployerAddr);
  await clawToken.waitForDeployment();
  const clawAddr = await clawToken.getAddress();
  console.log(`  CLAWToken: ${clawAddr}`);

  console.log("--- Deploying MonopolySettlement ---");
  const SettlementFactory = await ethers.getContractFactory("MonopolySettlement");
  const settlement = await SettlementFactory.deploy(
    deployerAddr,    // platform fee
    deployerAddr,    // GM signer (deployer acts as GM)
    clawAddr,
  );
  await settlement.waitForDeployment();
  const settlementAddr = await settlement.getAddress();
  console.log(`  MonopolySettlement: ${settlementAddr}`);

  console.log("--- Authorizing settlement as CLAW minter ---");
  const mintTx = await clawToken.setMinter(settlementAddr, true);
  await mintTx.wait();
  console.log(`  Done`);

  // ========== Step 1: Create Game ==========
  console.log("\n--- Step 1: Creating game ---");
  const createTx = await settlement.createGame(playerAddrs);
  const createReceipt = await createTx.wait();
  console.log(`  Game 0 created (tx: ${createReceipt!.hash.slice(0, 20)}...)`);

  let game = await settlement.getGame(0);
  console.log(`  Status: ${["PENDING", "DEPOSITING", "REVEALING", "STARTED", "SETTLED", "VOIDED"][Number(game.status)]}`);

  // ========== Step 2: Agents Deposit + Commit ==========
  console.log("\n--- Step 2: Agents depositing + committing ---");
  const entryFee = ethers.parseEther("0.001");
  const settlementForAgent = (wallet: ethers.Wallet) =>
    new ethers.Contract(settlementAddr, settlement.interface, wallet);

  for (let i = 0; i < 4; i++) {
    const agentSettlement = settlementForAgent(agents[i].wallet);
    const tx = await agentSettlement.depositAndCommit(0, agents[i].secretHash, { value: entryFee });
    const receipt = await tx.wait();
    console.log(`  Agent ${i} deposited (tx: ${receipt!.hash.slice(0, 20)}...)`);
  }

  game = await settlement.getGame(0);
  console.log(`  Status: ${["PENDING", "DEPOSITING", "REVEALING", "STARTED", "SETTLED", "VOIDED"][Number(game.status)]}`);
  console.log(`  Deposits: ${game.depositCount}/4`);

  // ========== Step 3: Agents Reveal ==========
  console.log("\n--- Step 3: Agents revealing secrets ---");
  for (let i = 0; i < 4; i++) {
    const agentSettlement = settlementForAgent(agents[i].wallet);
    const tx = await agentSettlement.revealSeed(0, agents[i].secret);
    const receipt = await tx.wait();
    console.log(`  Agent ${i} revealed (tx: ${receipt!.hash.slice(0, 20)}...)`);
  }

  game = await settlement.getGame(0);
  console.log(`  Status: ${["PENDING", "DEPOSITING", "REVEALING", "STARTED", "SETTLED", "VOIDED"][Number(game.status)]}`);
  console.log(`  Dice seed: ${game.diceSeed.slice(0, 20)}...`);
  console.log(`  Reveals: ${game.revealCount}/4`);

  // Verify CLAW minted
  for (let i = 0; i < 4; i++) {
    const bal = await clawToken.balanceOf(agents[i].wallet.address);
    console.log(`  Agent ${i} CLAW balance: ${ethers.formatEther(bal)}`);
  }

  // ========== Step 4: Run Game Engine ==========
  console.log("\n--- Step 4: Running game engine ---");
  const engine = new MonopolyEngine(playerAddrs, game.diceSeed);
  let allEvents: GameEvent[] = [];
  let roundCount = 0;
  let checkpointCount = 0;
  let actionCount = 0;
  const MAX_ACTIONS = 10000;
  const CHECKPOINT_INTERVAL = 10; // write checkpoint every N rounds (save gas)

  while (engine.getSnapshot().status !== "ENDED" && actionCount < MAX_ACTIONS) {
    const actions = engine.getLegalActions();
    if (actions.length === 0) break;

    // Smart auto-play
    const action: GameAction =
      actions.find(a => a.type === "buyProperty") ||
      actions.find(a => a.type === "rollDice") ||
      actions.find(a => a.type === "passBid") ||
      actions.find(a => a.type === "endTurn") ||
      actions[0];

    const events = engine.executeAction(action);
    allEvents.push(...events);
    actionCount++;

    // Check round change -> write checkpoint at intervals
    const snap = engine.getSnapshot();
    if (snap.round > roundCount) {
      roundCount = snap.round;

      // Write checkpoint to chain at intervals (and always at game end)
      if (roundCount % CHECKPOINT_INTERVAL === 0 || snap.status === "ENDED") {
        const { playersPacked, propertiesPacked, metaPacked } = engine.packForCheckpoint();
        try {
          const cpTx = await settlement.checkpoint(0, roundCount, playersPacked, propertiesPacked, metaPacked);
          await cpTx.wait();
          checkpointCount++;
          const aliveNames = snap.players.filter(p => p.alive).map(p => `P${p.index}($${p.cash})`);
          console.log(`  Round ${roundCount}: ${aliveNames.join(', ')} | Checkpoint #${checkpointCount}`);
        } catch (err: any) {
          console.log(`  Round ${roundCount}: Checkpoint failed (${err.message?.slice(0, 50)})`);
        }
      }
    }
  }

  const finalSnap = engine.getSnapshot();
  console.log(`\n  Game complete: ${roundCount} rounds, ${actionCount} actions`);
  console.log(`  ${checkpointCount} checkpoints on-chain`);
  console.log(`  Winner: Agent ${finalSnap.winner} (${playerAddrs[finalSnap.winner]?.slice(0, 14)}...)`);

  // ========== Step 5: Verify Checkpoint ==========
  console.log("\n--- Step 5: Verifying checkpoint on-chain ---");
  const cp = await settlement.getCheckpoint(0);
  console.log(`  Last checkpoint round: ${cp.round}`);

  // ========== Step 6: Settle Game ==========
  console.log("\n--- Step 6: GM settling game ---");
  const winnerAddr = playerAddrs[finalSnap.winner];
  const logHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(allEvents.slice(-50))));

  const settleTx = await settlement.settleGame(0, winnerAddr, logHash);
  const settleReceipt = await settleTx.wait();
  console.log(`  Settled (tx: ${settleReceipt!.hash.slice(0, 20)}...)`);

  game = await settlement.getGame(0);
  console.log(`  Status: ${["PENDING", "DEPOSITING", "REVEALING", "STARTED", "SETTLED", "VOIDED"][Number(game.status)]}`);
  console.log(`  Winner: ${game.winner}`);

  // ========== Step 7: Winner Withdraws ==========
  console.log("\n--- Step 7: Winner withdrawing prize ---");
  const balBefore = await provider.getBalance(winnerAddr);
  const deployerBalBefore = await provider.getBalance(deployerAddr);

  const agentSettlement = settlementForAgent(agents[finalSnap.winner].wallet);
  const withdrawTx = await agentSettlement.withdraw(0);
  const withdrawReceipt = await withdrawTx.wait();
  console.log(`  Withdrawn (tx: ${withdrawReceipt!.hash.slice(0, 20)}...)`);

  const balAfter = await provider.getBalance(winnerAddr);
  const deployerBalAfter = await provider.getBalance(deployerAddr);
  const gasUsed = withdrawReceipt!.gasUsed * withdrawReceipt!.gasPrice;

  const winnerGain = balAfter - balBefore + gasUsed;
  const platformGain = deployerBalAfter - deployerBalBefore; // deployer is platform

  console.log(`  Winner gained:    ${ethers.formatEther(winnerGain)} ETH`);
  console.log(`  Platform gained:  ${ethers.formatEther(platformGain)} ETH`);

  const contractBal = await provider.getBalance(settlementAddr);
  console.log(`  Contract balance: ${ethers.formatEther(contractBal)} ETH`);

  // ========== Summary ==========
  console.log("\n==============================================");
  console.log("  BASE SEPOLIA E2E TEST COMPLETE!");
  console.log("==============================================");
  console.log(`  CLAWToken:         ${clawAddr}`);
  console.log(`  MonopolySettlement: ${settlementAddr}`);
  console.log(`  Game ID:           0`);
  console.log(`  Rounds:            ${roundCount}`);
  console.log(`  Checkpoints:       ${checkpointCount}`);
  console.log(`  Winner:            Agent ${finalSnap.winner} (${winnerAddr.slice(0, 14)}...)`);
  console.log(`  Prize:             ${ethers.formatEther(winnerGain)} ETH`);
  console.log(`  Events:            ${allEvents.length}`);
  console.log("==============================================\n");

  console.log("Save these addresses for GM configuration:");
  console.log(`  SETTLEMENT_ADDRESS=${settlementAddr}`);
  console.log(`  CLAW_TOKEN_ADDRESS=${clawAddr}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

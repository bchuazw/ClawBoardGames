/**
 * E2E BSC Testnet Test Script
 * ==============================
 * Deploys contracts to BSC Testnet and runs a full game lifecycle.
 *
 * Prerequisites:
 *   - DEPLOYER_KEY env var set to a private key with BSC Testnet ETH (~0.01 ETH)
 *   - BSC Testnet RPC accessible (defaults to https://data-seed-prebsc-1-s1.binance.org:8545)
 *
 * Usage:
 *   npx hardhat run script/E2E_BscTestnet.ts --network bscTestnet
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
  console.log("  CLAWBOARDGAMES — BSC TESTNET E2E TEST");
  console.log("==============================================\n");
  console.log(`Deployer:  ${deployerAddr}`);
  console.log(`Network:   BSC Testnet`);
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
    const receipt = await tx.wait();
    if (!receipt) throw new Error(`Funding agent ${i} failed`);
    await new Promise((r) => setTimeout(r, 1200)); // let nonce + balance propagate on RPC
    const bal = await provider.getBalance(agents[i].wallet.address);
    if (bal < fundAmount) throw new Error(`Agent ${i} balance too low: ${ethers.formatEther(bal)} ETH`);
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

  // ========== Step 1: Create 10 open games ==========
  console.log("\n--- Step 1: Creating 10 open games ---");
  const openCount = 10;
  for (let i = 0; i < openCount; i++) {
    const tx = await settlement.createOpenGame();
    await tx.wait();
  }
  const openIds = await settlement.getOpenGameIds();
  console.log(`  Open game IDs: ${openIds.map((id: bigint) => Number(id)).join(", ")}`);
  const gameId = 0; // all 4 agents will join this open game

  let game = await settlement.getGame(gameId);
  console.log(`  Game ${gameId} status: ${["PENDING", "OPEN", "DEPOSITING", "REVEALING", "STARTED", "SETTLED", "VOIDED"][Number(game.status)]}`);

  // ========== Step 2: Agents Deposit + Commit (into same open game) ==========
  console.log("\n--- Step 2: Agents depositing + committing into open game ---");
  const entryFee = ethers.parseEther("0.001");
  const settlementForAgent = (wallet: ethers.Wallet) =>
    new ethers.Contract(settlementAddr, settlement.interface, wallet);

  for (let i = 0; i < 4; i++) {
    const agentSettlement = settlementForAgent(agents[i].wallet);
    const tx = await agentSettlement.depositAndCommit(gameId, agents[i].secretHash, { value: entryFee });
    const receipt = await tx.wait();
    console.log(`  Agent ${i} deposited (tx: ${receipt!.hash.slice(0, 20)}...)`);
    await new Promise((r) => setTimeout(r, 800)); // avoid nonce/ordering issues
  }

  game = await settlement.getGame(gameId);
  if (Number(game.depositCount) !== 4) throw new Error(`Expected 4 deposits, got ${game.depositCount}`);
  console.log(`  Status: ${["PENDING", "OPEN", "DEPOSITING", "REVEALING", "STARTED", "SETTLED", "VOIDED"][Number(game.status)]}`);
  console.log(`  Deposits: ${game.depositCount}/4`);

  // ========== Step 3: Agents Reveal ==========
  console.log("\n--- Step 3: Agents revealing secrets ---");
  for (let i = 0; i < 4; i++) {
    const agentSettlement = settlementForAgent(agents[i].wallet);
    const tx = await agentSettlement.revealSeed(gameId, agents[i].secret);
    const receipt = await tx.wait();
    console.log(`  Agent ${i} revealed (tx: ${receipt!.hash.slice(0, 20)}...)`);
  }

  game = await settlement.getGame(gameId);
  console.log(`  Status: ${["PENDING", "OPEN", "DEPOSITING", "REVEALING", "STARTED", "SETTLED", "VOIDED"][Number(game.status)]}`);
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
        const writeCheckpoint = async (retries = 2): Promise<boolean> => {
          for (let r = 0; r <= retries; r++) {
            try {
              if (r > 0) await new Promise((resolve) => setTimeout(resolve, 2000)); // delay before retry
              const cpTx = await settlement.checkpoint(gameId, roundCount, playersPacked, propertiesPacked, metaPacked);
              await cpTx.wait();
              await new Promise((resolve) => setTimeout(resolve, 1500)); // let nonce update before next tx
              return true;
            } catch (err: any) {
              const msg = err.message?.slice(0, 60) ?? "";
              if (r === retries) {
                console.log(`  Round ${roundCount}: Checkpoint failed (${msg})`);
                return false;
              }
            }
          }
          return false;
        };
        if (await writeCheckpoint()) {
          checkpointCount++;
          const aliveNames = snap.players.filter(p => p.alive).map(p => `P${p.index}($${p.cash})`);
          console.log(`  Round ${roundCount}: ${aliveNames.join(', ')} | Checkpoint #${checkpointCount}`);
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
  const cp = await settlement.getCheckpoint(gameId);
  console.log(`  Last checkpoint round: ${cp.round}`);

  // ========== Step 6: Settle Game ==========
  console.log("\n--- Step 6: GM settling game ---");
  const winnerAddr = playerAddrs[finalSnap.winner];
  const logHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(allEvents.slice(-50))));

  const settleTx = await settlement.settleGame(gameId, winnerAddr, logHash);
  const settleReceipt = await settleTx.wait();
  console.log(`  Settled (tx: ${settleReceipt!.hash.slice(0, 20)}...)`);

  game = await settlement.getGame(gameId);
  const statusNames = ["PENDING", "OPEN", "DEPOSITING", "REVEALING", "STARTED", "SETTLED", "VOIDED"];
  const statusIdx = Number(game.status);
  if (statusIdx !== 5) throw new Error(`Expected status SETTLED (5), got ${statusIdx} (${statusNames[statusIdx]})`);
  if ((game.winner as string).toLowerCase() !== winnerAddr.toLowerCase()) throw new Error(`Expected winner ${winnerAddr}, got ${game.winner}`);
  console.log(`  Status: ${statusNames[statusIdx]}`);
  console.log(`  Winner: ${game.winner}`);

  // ========== Step 7: Winner Withdraws ==========
  console.log("\n--- Step 7: Winner withdrawing prize ---");
  const balBefore = await provider.getBalance(winnerAddr);
  const deployerBalBefore = await provider.getBalance(deployerAddr);

  const agentSettlement = settlementForAgent(agents[finalSnap.winner].wallet);
  const withdrawTx = await agentSettlement.withdraw(gameId);
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
  console.log("  BSC TESTNET E2E TEST COMPLETE!");
  console.log("==============================================");
  console.log(`  CLAWToken:         ${clawAddr}`);
  console.log(`  MonopolySettlement: ${settlementAddr}`);
  console.log(`  Game ID:           ${gameId}`);
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

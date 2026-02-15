/**
 * E2E Full Lifecycle Test
 * ========================
 * Tests the ENTIRE on-chain flow from game creation through withdrawal,
 * integrated with the actual MonopolyEngine for realistic game simulation.
 *
 * Flow tested:
 *   1. Deploy CLAWToken + MonopolySettlement
 *   2. createGame(4 players)
 *   3. Each player depositAndCommit (0.001 native + secret hash)
 *   4. Each player revealSeed -> GameStarted event + CLAW minted
 *   5. Engine runs full game with dice seed from contract
 *   6. GM writes checkpoints each round (engine.packForCheckpoint)
 *   7. GM settles game on-chain with winner address
 *   8. Winner withdraws (80% / 20% split)
 *   9. Verify all balances, CLAW tokens, and state
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { MonopolySettlement, CLAWToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// Import the actual game engine
import { MonopolyEngine, GameStatus, Phase, GameAction, GameEvent } from "../../packages/engine/dist/index.js";

describe("E2E: Full Game Lifecycle (Engine + Contracts)", function () {
  // Increase timeout for full game simulation
  this.timeout(120_000);

  let settlement: MonopolySettlement;
  let clawToken: CLAWToken;
  let deployer: HardhatEthersSigner;
  let gm: HardhatEthersSigner;        // GM signer
  let platform: HardhatEthersSigner;   // platform fee recipient
  let players: HardhatEthersSigner[];  // 4 agent wallets
  let playerAddrs: [string, string, string, string];
  let secrets: Uint8Array[];
  let secretHashes: string[];

  beforeEach(async function () {
    [deployer, gm, platform, ...players] = await ethers.getSigners();
    players = players.slice(0, 4); // exactly 4 players

    playerAddrs = await Promise.all(
      players.map(p => p.getAddress())
    ) as [string, string, string, string];

    // Deploy CLAWToken
    const CLAWFactory = await ethers.getContractFactory("CLAWToken");
    clawToken = await CLAWFactory.deploy(await deployer.getAddress());
    await clawToken.waitForDeployment();

    // Deploy MonopolySettlement
    const SettlementFactory = await ethers.getContractFactory("MonopolySettlement");
    settlement = await SettlementFactory.deploy(
      await platform.getAddress(),
      await gm.getAddress(),
      await clawToken.getAddress()
    );
    await settlement.waitForDeployment();

    // Authorize settlement as CLAW minter
    await clawToken.setMinter(await settlement.getAddress(), true);

    // Generate secrets for each player
    secrets = [];
    secretHashes = [];
    for (let i = 0; i < 4; i++) {
      const secret = ethers.randomBytes(32);
      const hash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));
      secrets.push(secret);
      secretHashes.push(hash);
    }
  });

  it("should complete the full lifecycle: create -> deposit -> reveal -> play -> checkpoint -> settle -> withdraw", async function () {
    console.log("\n========================================");
    console.log("  E2E FULL LIFECYCLE TEST");
    console.log("========================================\n");

    // ========== STEP 1: Create Game ==========
    console.log("STEP 1: Creating game...");
    const createTx = await settlement.createGame(playerAddrs);
    const createReceipt = await createTx.wait();
    const gameId = 0; // first game

    const gameAfterCreate = await settlement.getGame(gameId);
    expect(gameAfterCreate.status).to.equal(2); // DEPOSITING (OPEN=1)
    expect(gameAfterCreate.players).to.deep.equal(playerAddrs);
    console.log(`  Game ${gameId} created. Status: DEPOSITING`);
    console.log(`  Players: ${playerAddrs.map(a => a.slice(0, 10) + '...').join(', ')}`);

    // ========== STEP 2: All Players Deposit + Commit ==========
    console.log("\nSTEP 2: Players depositing + committing...");
    const entryFee = ethers.parseEther("0.001");

    for (let i = 0; i < 4; i++) {
      const tx = await settlement.connect(players[i]).depositAndCommit(gameId, secretHashes[i], {
        value: entryFee,
      });
      await tx.wait();
      console.log(`  Player ${i} (${playerAddrs[i].slice(0, 10)}...) deposited 0.001 native + committed`);
    }

    const gameAfterDeposit = await settlement.getGame(gameId);
    expect(gameAfterDeposit.status).to.equal(3); // REVEALING
    expect(gameAfterDeposit.depositCount).to.equal(4);
    console.log(`  All 4 deposited. Status: REVEALING. Reveal deadline set.`);

    // Verify contract balance
    const contractBalance = await ethers.provider.getBalance(await settlement.getAddress());
    expect(contractBalance).to.equal(entryFee * 4n);
    console.log(`  Contract balance: ${ethers.formatEther(contractBalance)} native`);

    // ========== STEP 3: All Players Reveal ==========
    console.log("\nSTEP 3: Players revealing secrets...");

    let gameStartedEvent: any = null;
    for (let i = 0; i < 4; i++) {
      const tx = await settlement.connect(players[i]).revealSeed(gameId, secrets[i]);
      const receipt = await tx.wait();

      // Check for GameStarted event on last reveal
      if (i === 3) {
        const events = receipt?.logs || [];
        for (const log of events) {
          try {
            const parsed = settlement.interface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed?.name === "GameStarted") {
              gameStartedEvent = parsed;
            }
          } catch { /* ignore non-matching logs */ }
        }
      }
      console.log(`  Player ${i} revealed secret`);
    }

    expect(gameStartedEvent).to.not.be.null;
    const diceSeed = gameStartedEvent!.args[1]; // bytes32 dice seed
    console.log(`  GameStarted! Dice seed: ${diceSeed.slice(0, 20)}...`);

    const gameAfterReveal = await settlement.getGame(gameId);
    expect(gameAfterReveal.status).to.equal(4); // STARTED
    expect(gameAfterReveal.revealCount).to.equal(4);
    expect(gameAfterReveal.diceSeed).to.equal(diceSeed);

    // Verify CLAW tokens minted (1000 CLAW * 10^18 per player)
    for (let i = 0; i < 4; i++) {
      const balance = await clawToken.balanceOf(playerAddrs[i]);
      expect(balance).to.equal(ethers.parseEther("1000"));
    }
    console.log(`  CLAW tokens minted: 1000 CLAW per player`);

    // ========== STEP 4: Run Game Engine ==========
    console.log("\nSTEP 4: Running game engine simulation...");

    const engine = new MonopolyEngine(playerAddrs, diceSeed);
    let allEvents: GameEvent[] = [];
    let roundCount = 0;
    let checkpointCount = 0;

    // Auto-play: pick the first available legal action each turn
    let actionCount = 0;
    const MAX_ACTIONS = 10000; // safety limit

    while (engine.getSnapshot().status !== "ENDED" && actionCount < MAX_ACTIONS) {
      const snapshot = engine.getSnapshot();
      const actions = engine.getLegalActions();

      if (actions.length === 0) {
        console.log(`  WARNING: No legal actions available at turn ${snapshot.turn}`);
        break;
      }

      // Smart action selection: prefer buying, then rolling, then ending turn
      let action: GameAction = actions[0];
      const buyAction = actions.find(a => a.type === "buyProperty");
      const rollAction = actions.find(a => a.type === "rollDice");
      const endAction = actions.find(a => a.type === "endTurn");
      const bidAction = actions.find(a => a.type === "bid");
      const passAction = actions.find(a => a.type === "passBid");

      if (buyAction) action = buyAction;
      else if (rollAction) action = rollAction;
      else if (bidAction) action = { type: "bid", amount: (bidAction as any).amount || 10 };
      else if (passAction) action = passAction;
      else if (endAction) action = endAction;
      else action = actions[0];

      const events = engine.executeAction(action);
      allEvents.push(...events);
      actionCount++;

      // Check if round changed -> write checkpoint
      const newSnapshot = engine.getSnapshot();
      if (newSnapshot.round > roundCount) {
        roundCount = newSnapshot.round;

        // Write checkpoint to contract (GM only)
        const { playersPacked, propertiesPacked, metaPacked } = engine.packForCheckpoint();

        const cpTx = await settlement.connect(gm).checkpoint(
          gameId,
          roundCount,
          playersPacked,
          propertiesPacked,
          metaPacked
        );
        await cpTx.wait();
        checkpointCount++;

        if (roundCount % 25 === 0 || roundCount <= 3) {
          const aliveNames = newSnapshot.players.filter(p => p.alive).map(p => `P${p.index}($${p.cash})`);
          console.log(`  Round ${roundCount}: ${aliveNames.join(', ')} | ${newSnapshot.aliveCount} alive | Checkpoint #${checkpointCount} written on-chain`);
        }
      }
    }

    const finalSnapshot = engine.getSnapshot();
    console.log(`\n  Game ended after ${roundCount} rounds, ${actionCount} actions`);
    console.log(`  ${checkpointCount} checkpoints written on-chain`);
    console.log(`  Winner: Player ${finalSnapshot.winner} (${playerAddrs[finalSnapshot.winner]?.slice(0, 10)}...)`);

    expect(finalSnapshot.status).to.equal("ENDED");
    expect(finalSnapshot.winner).to.be.gte(0);

    // ========== STEP 5: Verify checkpoint readback ==========
    console.log("\nSTEP 5: Verifying checkpoint data on-chain...");

    const lastCheckpoint = await settlement.getCheckpoint(gameId);
    expect(lastCheckpoint.round).to.equal(roundCount);
    console.log(`  Last checkpoint round: ${lastCheckpoint.round}`);
    console.log(`  playersPacked: ${lastCheckpoint.playersPacked}`);
    console.log(`  propertiesPacked: ${lastCheckpoint.propertiesPacked}`);
    console.log(`  metaPacked: ${lastCheckpoint.metaPacked}`);

    // ========== STEP 6: GM Settles Game ==========
    console.log("\nSTEP 6: GM settling game on-chain...");

    const winnerIdx = finalSnapshot.winner;
    const winnerAddr = playerAddrs[winnerIdx];
    const gameLogHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(allEvents.slice(-100))));

    const settleTx = await settlement.connect(gm).settleGame(gameId, winnerAddr, gameLogHash);
    await settleTx.wait();

    const gameAfterSettle = await settlement.getGame(gameId);
    expect(gameAfterSettle.status).to.equal(5); // SETTLED
    expect(gameAfterSettle.winner).to.equal(winnerAddr);
    console.log(`  Game settled. Winner: ${winnerAddr.slice(0, 10)}...`);
    console.log(`  Game log hash: ${gameLogHash.slice(0, 20)}...`);

    // Verify all CLAW burned after settle
    for (let i = 0; i < 4; i++) {
      const clawBal = await clawToken.balanceOf(playerAddrs[i]);
      expect(clawBal).to.equal(0n);
    }
    console.log(`  All CLAW burned after settle (4 players at 0)`);

    // ========== STEP 7: Winner Withdraws ==========
    console.log("\nSTEP 7: Winner withdrawing prize...");

    const totalPot = entryFee * 4n;                          // 0.004 native
    const winnerShare = (totalPot * 8000n) / 10000n;         // 0.0032 (80%)
    const platformShare = totalPot - winnerShare;            // 0.0008 (20%)

    const winnerBalBefore = await ethers.provider.getBalance(winnerAddr);
    const platformBalBefore = await ethers.provider.getBalance(await platform.getAddress());

    const withdrawTx = await settlement.connect(players[winnerIdx]).withdraw(gameId);
    const withdrawReceipt = await withdrawTx.wait();
    const gasUsed = withdrawReceipt!.gasUsed * withdrawReceipt!.gasPrice;

    const winnerBalAfter = await ethers.provider.getBalance(winnerAddr);
    const platformBalAfter = await ethers.provider.getBalance(await platform.getAddress());

    // Winner received 80% minus gas
    const winnerGain = winnerBalAfter - winnerBalBefore + gasUsed;
    expect(winnerGain).to.equal(winnerShare);
    console.log(`  Winner received: ${ethers.formatEther(winnerShare)} native (80%)`);

    // Platform received 20%
    const platformGain = platformBalAfter - platformBalBefore;
    expect(platformGain).to.equal(platformShare);
    console.log(`  Platform received: ${ethers.formatEther(platformShare)} native (20%)`);

    // Contract should be empty now
    const contractBalAfter = await ethers.provider.getBalance(await settlement.getAddress());
    expect(contractBalAfter).to.equal(0n);
    console.log(`  Contract balance: ${ethers.formatEther(contractBalAfter)} native (empty)`);

    // ========== STEP 8: Verify Final State ==========
    console.log("\nSTEP 8: Final verification...");

    const finalGame = await settlement.getGame(gameId);
    expect(finalGame.status).to.equal(5); // SETTLED

    // Verify double-withdraw is blocked
    try {
      await settlement.connect(players[winnerIdx]).withdraw(gameId);
      expect.fail("Should have reverted");
    } catch (err: any) {
      expect(err.message).to.include("Already paid");
    }
    console.log(`  Double-withdraw correctly blocked`);

    // ========== SUMMARY ==========
    console.log("\n========================================");
    console.log("  E2E TEST PASSED!");
    console.log("========================================");
    console.log(`  Game ID:        ${gameId}`);
    console.log(`  Rounds played:  ${roundCount}`);
    console.log(`  Actions taken:  ${actionCount}`);
    console.log(`  Checkpoints:    ${checkpointCount}`);
    console.log(`  Winner:         Player ${winnerIdx} (${winnerAddr.slice(0, 20)}...)`);
    console.log(`  Prize:          ${ethers.formatEther(winnerShare)} native`);
    console.log(`  Platform fee:   ${ethers.formatEther(platformShare)} native`);
    console.log(`  Total events:   ${allEvents.length}`);
    console.log(`  CLAW per player: 1000`);
    console.log("========================================\n");
  });

  it("should allow checkpoint recovery — engine restores from packed state", async function () {
    console.log("\n========================================");
    console.log("  E2E CHECKPOINT RECOVERY TEST");
    console.log("========================================\n");

    // Create + deposit + reveal
    await settlement.createGame(playerAddrs);
    const entryFee = ethers.parseEther("0.001");
    for (let i = 0; i < 4; i++) {
      await settlement.connect(players[i]).depositAndCommit(0, secretHashes[i], { value: entryFee });
    }
    for (let i = 0; i < 4; i++) {
      await settlement.connect(players[i]).revealSeed(0, secrets[i]);
    }

    const gameInfo = await settlement.getGame(0);
    const diceSeed = gameInfo.diceSeed;

    // Run engine for a few rounds
    const engine = new MonopolyEngine(playerAddrs, diceSeed);
    let roundCount = 0;
    let actionCount = 0;

    while (roundCount < 5 && actionCount < 500) {
      const actions = engine.getLegalActions();
      if (actions.length === 0) break;
      const snapshot = engine.getSnapshot();
      if (snapshot.status === "ENDED") break;

      const action = actions.find(a => a.type === "buyProperty") || actions[0];
      engine.executeAction(action);
      actionCount++;

      if (engine.getSnapshot().round > roundCount) {
        roundCount = engine.getSnapshot().round;
      }
    }

    console.log(`  Original engine: ${roundCount} rounds, ${actionCount} actions`);

    // Pack and write checkpoint
    const { playersPacked, propertiesPacked, metaPacked } = engine.packForCheckpoint();
    await settlement.connect(gm).checkpoint(0, roundCount, playersPacked, propertiesPacked, metaPacked);
    console.log(`  Checkpoint written at round ${roundCount}`);

    // Read checkpoint back from chain
    const cp = await settlement.getCheckpoint(0);
    expect(cp.round).to.equal(roundCount);

    // Restore engine from checkpoint
    const restored = MonopolyEngine.fromCheckpoint(
      playerAddrs,
      diceSeed,
      cp.playersPacked,
      cp.propertiesPacked,
      cp.metaPacked,
    );

    const origSnap = engine.getSnapshot();
    const restoredSnap = restored.getSnapshot();

    // Verify player states match
    for (let i = 0; i < 4; i++) {
      expect(restoredSnap.players[i].position).to.equal(origSnap.players[i].position);
      expect(restoredSnap.players[i].cash).to.equal(origSnap.players[i].cash);
      expect(restoredSnap.players[i].alive).to.equal(origSnap.players[i].alive);
      expect(restoredSnap.players[i].inJail).to.equal(origSnap.players[i].inJail);
    }

    // Verify property states match
    for (let i = 0; i < restoredSnap.properties.length; i++) {
      expect(restoredSnap.properties[i].ownerIndex).to.equal(origSnap.properties[i].ownerIndex);
      expect(restoredSnap.properties[i].mortgaged).to.equal(origSnap.properties[i].mortgaged);
    }

    console.log("  Engine state restored correctly from on-chain checkpoint!");
    console.log(`  Players: ${restoredSnap.players.map(p => `P${p.index}(pos=${p.position}, $${p.cash}, alive=${p.alive})`).join(', ')}`);
    console.log(`  Alive count: ${restoredSnap.aliveCount}`);

    console.log("\n========================================");
    console.log("  CHECKPOINT RECOVERY TEST PASSED!");
    console.log("========================================\n");
  });

  it("should handle a multi-game scenario", async function () {
    console.log("\n========================================");
    console.log("  E2E MULTI-GAME TEST");
    console.log("========================================\n");

    const entryFee = ethers.parseEther("0.001");

    // Create 2 games
    await settlement.createGame(playerAddrs);
    await settlement.createGame(playerAddrs);

    // Run both through deposit + reveal
    for (let g = 0; g < 2; g++) {
      for (let i = 0; i < 4; i++) {
        const secret = ethers.randomBytes(32);
        const hash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));
        secrets[i] = secret;
        secretHashes[i] = hash;
        await settlement.connect(players[i]).depositAndCommit(g, hash, { value: entryFee });
      }
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).revealSeed(g, secrets[i]);
      }
    }

    const game0 = await settlement.getGame(0);
    const game1 = await settlement.getGame(1);
    expect(game0.status).to.equal(4); // STARTED
    expect(game1.status).to.equal(4); // STARTED

    console.log("  2 games running simultaneously");

    // Quick play game 0
    const engine0 = new MonopolyEngine(playerAddrs, game0.diceSeed);
    let actions0 = 0;
    while (engine0.getSnapshot().status !== "ENDED" && actions0 < 5000) {
      const acts = engine0.getLegalActions();
      if (acts.length === 0) break;
      const action = acts.find(a => a.type === "buyProperty") || acts[0];
      engine0.executeAction(action);
      actions0++;
    }

    const snap0 = engine0.getSnapshot();
    if (snap0.status === "ENDED") {
      const winner0 = playerAddrs[snap0.winner];
      const logHash0 = ethers.keccak256(ethers.toUtf8Bytes("game0-log"));
      await settlement.connect(gm).settleGame(0, winner0, logHash0);
      await settlement.connect(players[snap0.winner]).withdraw(0);
      console.log(`  Game 0: settled, Player ${snap0.winner} withdrew`);
    }

    // Quick play game 1
    const engine1 = new MonopolyEngine(playerAddrs, game1.diceSeed);
    let actions1 = 0;
    while (engine1.getSnapshot().status !== "ENDED" && actions1 < 5000) {
      const acts = engine1.getLegalActions();
      if (acts.length === 0) break;
      const action = acts.find(a => a.type === "buyProperty") || acts[0];
      engine1.executeAction(action);
      actions1++;
    }

    const snap1 = engine1.getSnapshot();
    if (snap1.status === "ENDED") {
      const winner1 = playerAddrs[snap1.winner];
      const logHash1 = ethers.keccak256(ethers.toUtf8Bytes("game1-log"));
      await settlement.connect(gm).settleGame(1, winner1, logHash1);
      await settlement.connect(players[snap1.winner]).withdraw(1);
      console.log(`  Game 1: settled, Player ${snap1.winner} withdrew`);
    }

    // Verify game count
    expect(await settlement.gameCount()).to.equal(2);

    console.log(`  Game 0: ${actions0} actions, ${snap0.round} rounds`);
    console.log(`  Game 1: ${actions1} actions, ${snap1.round} rounds`);
    console.log("\n  MULTI-GAME TEST PASSED!\n");
  });
});

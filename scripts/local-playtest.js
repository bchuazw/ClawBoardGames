/**
 * local-playtest.js
 *
 * Quick local playtest: 4 AI agents connect to the same open slot (gameId 0)
 * via WebSocket; when all 4 are connected, the game starts automatically.
 * No POST /games/create. Run the GM server in LOCAL_MODE first:
 *
 *   cd packages/gamemaster
 *   LOCAL_MODE=true node dist/index.js
 *
 * Then run this script:
 *   node scripts/local-playtest.js
 */

const WebSocket = require("ws");

const GM_URL = process.env.GM_URL || "http://localhost:3001";
const GM_WS = process.env.GM_WS || "ws://localhost:3001/ws";

const PLAYERS = [
  "0xAA00000000000000000000000000000000000001",
  "0xBB00000000000000000000000000000000000002",
  "0xCC00000000000000000000000000000000000003",
  "0xDD00000000000000000000000000000000000004",
];

// Simple policy: buy if affordable, bid occasionally, roll dice, end turn
function decide(snapshot, legalActions, playerIndex) {
  const me = snapshot.players[playerIndex];
  const cash = me ? me.cash : 0;

  // Buy if we can afford it and it's less than 60% of our cash
  const buy = legalActions.find((a) => a.type === "buyProperty");
  if (buy && cash > 400) return buy;

  // Decline if too expensive
  const decline = legalActions.find((a) => a.type === "declineBuy");
  if (decline) return decline;

  // Bid in auction if we have plenty of cash
  const bid = legalActions.find((a) => a.type === "bid");
  if (bid && cash > 600) return bid;
  const passBid = legalActions.find((a) => a.type === "passBid");
  if (passBid) return passBid;

  // Pay jail fee if we can
  const payJail = legalActions.find((a) => a.type === "payJailFee");
  if (payJail && cash > 200) return payJail;

  // Roll dice
  const roll = legalActions.find((a) => a.type === "rollDice");
  if (roll) return roll;

  // End turn
  const endTurn = legalActions.find((a) => a.type === "endTurn");
  if (endTurn) return endTurn;

  return legalActions[0];
}

function connectAgent(gameId, address, playerIndex) {
  return new Promise((resolve, reject) => {
    const url = `${GM_WS}?gameId=${gameId}&address=${address}`;
    const ws = new WebSocket(url);
    let moveCount = 0;

    ws.on("open", () => {
      console.log(`  [Agent P${playerIndex}] Connected (${address.slice(0, 10)}...)`);
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "yourTurn") {
        const action = decide(msg.snapshot, msg.legalActions, playerIndex);
        moveCount++;
        ws.send(JSON.stringify({ type: "action", action }));
      }

      if (msg.type === "gameEnded") {
        const snap = msg.snapshot;
        const winner = snap.players[msg.winner];
        console.log(`  [Agent P${playerIndex}] Game over! Winner: P${msg.winner} (${winner.address.slice(0, 10)}...) | My moves: ${moveCount}`);
        ws.close();
        resolve({
          playerIndex,
          winner: msg.winner,
          snapshot: snap,
        });
      }

      if (msg.type === "error") {
        console.error(`  [Agent P${playerIndex}] Error: ${msg.message}`);
      }
    });

    ws.on("error", (err) => {
      console.error(`  [Agent P${playerIndex}] WS Error:`, err.message);
      reject(err);
    });

    ws.on("close", () => {
      // Will resolve via gameEnded, or reject if unexpected
    });
  });
}

async function main() {
  console.log("[Playtest] Starting local Monopoly playtest...");
  console.log(`[Playtest] GM Server: ${GM_URL}`);
  console.log(`[Playtest] Players: ${PLAYERS.map((p) => p.slice(0, 10)).join(", ")}`);
  console.log();

  // Use slot 0 (one of 10 open slots 0..9); when 4 join same slot, game starts
  const gameId = 0;
  console.log(`[Playtest] Connecting 4 agents to slot ${gameId} (game starts when 4/4 join)...`);

  // Connect all 4 agents
  const agentPromises = PLAYERS.map((addr, i) => connectAgent(gameId, addr, i));

  // Wait for all to finish (first to resolve means game ended)
  const results = await Promise.all(agentPromises);
  const result = results[0];

  console.log();
  console.log("=== GAME RESULTS ===");
  console.log(`Winner: Player ${result.winner} (${PLAYERS[result.winner].slice(0, 10)}...)`);
  console.log(`Final round: ${result.snapshot.round}`);
  console.log(`Final turn: ${result.snapshot.turn}`);
  console.log();
  console.log("Player standings:");
  for (const p of result.snapshot.players) {
    const status = p.alive ? `$${p.cash}` : "BANKRUPT";
    console.log(`  P${p.index} (${p.address.slice(0, 10)}...): ${status} @ ${p.tileName}`);
  }
}

main().catch((err) => {
  console.error("[Playtest] Fatal error:", err);
  process.exit(1);
});

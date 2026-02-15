import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { Orchestrator } from "./Orchestrator";
import { SettlementClient } from "./SettlementClient";
import dotenv from "dotenv";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3001", 10);
const LOCAL_MODE = process.env.LOCAL_MODE === "true";
const RPC_URL = process.env.RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";
const SETTLEMENT_ADDRESS = process.env.SETTLEMENT_ADDRESS || "";
const GM_PRIVATE_KEY = process.env.GM_PRIVATE_KEY || "";
const OPEN_GAME_TARGET = parseInt(process.env.OPEN_GAME_TARGET || "10", 10);
const OPEN_GAME_REPLENISH_INTERVAL_MS = parseInt(process.env.OPEN_GAME_REPLENISH_INTERVAL_MS || "300000", 10); // 5 min

let settlement: SettlementClient | null = null;

if (LOCAL_MODE) {
  console.log("[GM Server] Running in LOCAL_MODE (no blockchain)");
} else {
  if (!SETTLEMENT_ADDRESS || !GM_PRIVATE_KEY) {
    console.error("Missing SETTLEMENT_ADDRESS or GM_PRIVATE_KEY. Use LOCAL_MODE=true for testing.");
    process.exit(1);
  }
  settlement = new SettlementClient(RPC_URL, SETTLEMENT_ADDRESS, GM_PRIVATE_KEY);
}

// ========== Setup ==========

const orchestrator = new Orchestrator(settlement);

const app = express();
app.use(express.json());

// CORS for local development
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (_req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});

// Health check (includes settlementAddress in on-chain mode for frontend to show contract)
app.get("/health", (_req, res) => {
  const payload: Record<string, unknown> = {
    status: "ok",
    mode: LOCAL_MODE ? "local" : "on-chain",
    activeGames: orchestrator.getActiveGames(),
    gmAddress: settlement?.address || "local-mode",
  };
  if (!LOCAL_MODE && SETTLEMENT_ADDRESS) payload.settlementAddress = SETTLEMENT_ADDRESS;
  res.json(payload);
});

// List active games (and which are running with all agents disconnected)
app.get("/games", (_req, res) => {
  const games = orchestrator.getActiveGames();
  const disconnected = games.filter((id) => {
    const p = orchestrator.getGameProcess(id);
    return p?.allAgentsDisconnected === true;
  });
  res.json({ games, disconnected });
});

// List open game IDs (any agent can join). On-chain: from contract; local: from orchestrator slots.
app.get("/games/open", async (_req, res) => {
  try {
    if (LOCAL_MODE) {
      const open = orchestrator.getOpenSlotIds();
      return res.json({ open });
    }
    const open = await settlement!.getOpenGameIds();
    res.json({ open });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get open games" });
  }
});

// Slot/lobby details for spectate UI (local: waiting X/4 or active; on-chain: open IDs as open).
app.get("/games/slots", async (_req, res) => {
  try {
    if (LOCAL_MODE) {
      const slots = orchestrator.getSlotDetails();
      return res.json({ slots });
    }
    const open = await settlement!.getOpenGameIds();
    const slots = await Promise.all(
      open.map(async (id: number) => {
        try {
          const game = await settlement!.getGame(id);
          return { id, status: "open" as const, playerCount: game.depositCount };
        } catch {
          return { id, status: "open" as const };
        }
      })
    );
    res.json({ slots });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get slots" });
  }
});

// Contract status enum: SETTLED = 5
const STATUS_SETTLED = 5;
const HISTORY_LIMIT = 100;

// Past settled games for history page (on-chain only; from contract).
app.get("/games/history", async (_req, res) => {
  try {
    if (LOCAL_MODE) {
      return res.json({ history: [] });
    }
    const total = await settlement!.getGameCount();
    if (total === 0) return res.json({ history: [] });
    const start = Math.max(0, total - HISTORY_LIMIT);
    const entries: { gameId: number; winner: string; players: string[]; status: number }[] = [];
    for (let gameId = start; gameId < total; gameId++) {
      const g = await settlement!.getGame(gameId);
      if (g.status === STATUS_SETTLED && g.winner) {
        entries.push({
          gameId,
          winner: g.winner,
          players: g.players,
          status: g.status,
        });
      }
    }
    entries.reverse();
    res.json({ history: entries });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get history" });
  }
});

// In-progress game state (round, turn, snapshot). Only available while the GM has the game running. Use to see if a game is progressing.
app.get("/games/:gameId/state", (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId, 10);
    if (isNaN(gameId) || gameId < 0) {
      return res.status(400).json({ error: "Invalid gameId" });
    }
    const process = orchestrator.getGameProcess(gameId);
    if (!process || !process.isRunning) {
      return res.status(404).json({ running: false, message: "No active game process for this gameId" });
    }
    const snapshot = process.getSnapshot();
    res.json({ running: true, gameId, round: snapshot.round, turn: snapshot.turn, currentPlayerIndex: snapshot.currentPlayerIndex, status: snapshot.status, phase: snapshot.phase, aliveCount: snapshot.aliveCount, winner: snapshot.winner, lastDice: snapshot.lastDice, snapshot });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get game state" });
  }
});

// Single game status by ID (on-chain only). Use to check any game and whether settlement has concluded.
// Must be after /games/history so "history" is not treated as a gameId.
app.get("/games/:gameId", async (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId, 10);
    if (isNaN(gameId) || gameId < 0) {
      return res.status(400).json({ error: "Invalid gameId" });
    }
    if (LOCAL_MODE || !settlement) {
      return res.status(400).json({ error: "Single game lookup only in on-chain mode" });
    }
    const g = await settlement.getGame(gameId);
    const settled = g.status === STATUS_SETTLED;
    res.json({
      gameId,
      status: g.status,
      statusLabel: ["PENDING", "OPEN", "DEPOSITING", "REVEALING", "STARTED", "SETTLED", "VOIDED"][g.status] ?? "UNKNOWN",
      settlementConcluded: settled,
      winnerCanWithdraw: settled && !!g.winner && !g.winnerPaid,
      winnerClaimed: !!g.winnerPaid,
      players: g.players,
      depositCount: g.depositCount,
      winner: g.winner || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get game" });
  }
});

// Create a local game (deprecated in local mode: use slots 0..9 instead; kept for backward compatibility)
app.post("/games/create", (req, res) => {
  try {
    const { players, diceSeed } = req.body;
    if (!players || !Array.isArray(players) || players.length !== 4) {
      res.status(400).json({ error: "Provide exactly 4 player addresses in 'players' array" });
      return;
    }
    // Validate addresses - strict hex in on-chain mode, any string in local mode
    for (const p of players) {
      if (typeof p !== "string" || p.length === 0) {
        res.status(400).json({ error: `Invalid address: ${p}` });
        return;
      }
      if (!LOCAL_MODE && !p.match(/^0x[0-9a-fA-F]{40}$/)) {
        res.status(400).json({ error: `Invalid hex address: ${p}` });
        return;
      }
    }
    const gameId = orchestrator.createLocalGame(
      players as [string, string, string, string],
      diceSeed,
    );
    console.log(`[GM Server] Created local game ${gameId}`);
    res.json({ success: true, gameId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Manually spawn a game from chain (non-local mode)
app.post("/games/:gameId/spawn", async (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId, 10);
    await orchestrator.spawnGame(gameId);
    res.json({ success: true, gameId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Replenish open games (on-chain only): create until count >= OPEN_GAME_TARGET
async function replenishOpenGames(): Promise<{ created: number; openCount: number }> {
  const result = { created: 0, openCount: 0 };
  if (LOCAL_MODE || !settlement) return result;
  try {
    const open = await settlement.getOpenGameIds();
    result.openCount = open.length;
    if (open.length >= OPEN_GAME_TARGET) return result;
    const toCreate = OPEN_GAME_TARGET - open.length;
    console.log(`[GM Server] Replenishing open games: ${open.length} -> ${OPEN_GAME_TARGET} (creating ${toCreate})`);
    for (let i = 0; i < toCreate; i++) {
      await settlement.createOpenGame();
      result.created++;
      console.log(`[GM Server] Created open game ${i + 1}/${toCreate}`);
    }
    result.openCount = open.length + result.created;
  } catch (err: any) {
    console.error("[GM Server] replenishOpenGames error:", err?.message || err);
  }
  return result;
}

// Trigger replenish on demand (fill empty lobbies)
app.post("/games/replenish", async (_req, res) => {
  if (LOCAL_MODE || !settlement) {
    return res.status(400).json({ error: "Replenish only in on-chain mode" });
  }
  try {
    const result = await replenishOpenGames();
    res.json({ ok: true, created: result.created, openCount: result.openCount });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Replenish failed" });
  }
});

// ========== WebSocket Server ==========

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket: WebSocket, req) => {
  // Parse query: /ws?gameId=0&address=0x1234...
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  const gameIdStr = url.searchParams.get("gameId");
  const address = url.searchParams.get("address") || undefined;

  if (!gameIdStr) {
    socket.send(JSON.stringify({ type: "error", message: "Missing gameId" }));
    socket.close();
    return;
  }

  const gameId = parseInt(gameIdStr, 10);
  orchestrator.handleConnection(socket, gameId, address).catch((err) => {
    console.error("[GM Server] handleConnection error:", err);
    socket.send(JSON.stringify({ type: "error", message: err?.message || "Connection failed" }));
    socket.close();
  });
});

// ========== Start ==========

server.listen(PORT, () => {
  console.log(`[GM Server] Listening on port ${PORT}`);
  if (LOCAL_MODE) {
    console.log(`[GM Server] LOCAL_MODE active — POST /games/create to start a game`);
  } else {
    console.log(`[GM Server] Settlement: ${SETTLEMENT_ADDRESS}`);
    console.log(`[GM Server] GM Signer: ${settlement!.address}`);
  }
  orchestrator.startListening();
});

// Cleanup every 5 minutes
setInterval(() => orchestrator.cleanup(), 5 * 60 * 1000);

if (!LOCAL_MODE && settlement) {
  replenishOpenGames(); // run once on startup
  setInterval(replenishOpenGames, OPEN_GAME_REPLENISH_INTERVAL_MS);
  orchestrator.onGameEnd = replenishOpenGames; // when a game ends, top up open lobbies
}

export { app, server, orchestrator };

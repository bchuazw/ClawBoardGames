import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { Orchestrator } from "./Orchestrator";
import { SettlementClient } from "./SettlementClient";
import { ISettlementClient } from "./ISettlementClient";
import dotenv from "dotenv";

dotenv.config();

export type Chain = "solana" | "bnb" | "evm";

const PORT = parseInt(process.env.PORT || "3001", 10);
const LOCAL_MODE = process.env.LOCAL_MODE === "true";
const OPEN_GAME_TARGET = parseInt(process.env.OPEN_GAME_TARGET || "10", 10);
const OPEN_GAME_REPLENISH_INTERVAL_MS = parseInt(process.env.OPEN_GAME_REPLENISH_INTERVAL_MS || "300000", 10);

// Solana
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const SOLANA_PROGRAM_ID = process.env.SOLANA_PROGRAM_ID || "";
const GM_SOLANA_KEYPAIR = process.env.GM_SOLANA_KEYPAIR || "";

// BNB
const BNB_RPC_URL = process.env.RPC_URL || process.env.BNB_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";
const BNB_SETTLEMENT_ADDRESS = process.env.SETTLEMENT_ADDRESS || process.env.BNB_SETTLEMENT_ADDRESS || "";
const BNB_GM_PRIVATE_KEY = process.env.BNB_GM_PRIVATE_KEY || process.env.GM_PRIVATE_KEY || "";

// Monad (EVM)
const EVM_RPC_URL = process.env.MONAD_RPC_URL || process.env.EVM_RPC_URL || "https://rpc.monad.xyz";
const EVM_SETTLEMENT_ADDRESS = process.env.MONAD_SETTLEMENT_ADDRESS || process.env.EVM_SETTLEMENT_ADDRESS || "";
const EVM_GM_PRIVATE_KEY = process.env.MONAD_GM_PRIVATE_KEY || process.env.EVM_GM_PRIVATE_KEY || "";

const settlements = new Map<Chain, ISettlementClient>();

if (!LOCAL_MODE) {
  if (SOLANA_PROGRAM_ID && GM_SOLANA_KEYPAIR) {
    const { SolanaSettlementClient } = require("./SolanaSettlementClient");
    settlements.set("solana", new SolanaSettlementClient(SOLANA_RPC_URL, SOLANA_PROGRAM_ID, GM_SOLANA_KEYPAIR));
    console.log(`[GM Server] Solana: program=${SOLANA_PROGRAM_ID}`);
  }
  if (BNB_SETTLEMENT_ADDRESS && BNB_GM_PRIVATE_KEY) {
    settlements.set("bnb", new SettlementClient(BNB_RPC_URL, BNB_SETTLEMENT_ADDRESS, BNB_GM_PRIVATE_KEY));
    console.log(`[GM Server] BNB: contract=${BNB_SETTLEMENT_ADDRESS}`);
  }
  if (EVM_SETTLEMENT_ADDRESS && EVM_GM_PRIVATE_KEY) {
    settlements.set("evm", new SettlementClient(EVM_RPC_URL, EVM_SETTLEMENT_ADDRESS, EVM_GM_PRIVATE_KEY));
    console.log(`[GM Server] Monad (EVM): contract=${EVM_SETTLEMENT_ADDRESS}`);
  }
}

const chains = Array.from(settlements.keys());

function getChain(req: express.Request): Chain | null {
  const chain = (req.query.chain as string)?.toLowerCase();
  if (chain && (chain === "solana" || chain === "bnb" || chain === "evm")) return chain as Chain;
  if (chains.length === 1) return chains[0];
  return null;
}

// ========== Setup ==========

const orchestrator = new Orchestrator(settlements);

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

app.get("/health", (req, res) => {
  const chain = getChain(req);
  const payload: Record<string, unknown> = {
    status: "ok",
    mode: LOCAL_MODE ? "local" : "on-chain",
    chains: chains,
    activeGames: orchestrator.getActiveGames(chain ?? undefined),
  };
  if (chain && settlements.has(chain)) {
    const s = settlements.get(chain)!;
    payload.gmAddress = s.address;
    if (chain === "bnb" && BNB_SETTLEMENT_ADDRESS) payload.settlementAddress = BNB_SETTLEMENT_ADDRESS;
    if (chain === "evm" && EVM_SETTLEMENT_ADDRESS) payload.settlementAddress = EVM_SETTLEMENT_ADDRESS;
    if (chain === "solana" && SOLANA_PROGRAM_ID) payload.programId = SOLANA_PROGRAM_ID;
  } else if (chains.length > 0) {
    payload.gmAddress = settlements.get(chains[0])!.address;
  }
  res.json(payload);
});

app.get("/games", (req, res) => {
  const chain = getChain(req);
  const { games, disconnected } = orchestrator.getGamesAndDisconnected(chain ?? undefined);
  res.json({ games, disconnected });
});

app.get("/games/open", async (req, res) => {
  const chain = getChain(req);
  if (LOCAL_MODE) {
    try {
      const open = orchestrator.getOpenSlotIds();
      return res.json({ open });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to get open games" });
    }
  }
  if (!chain || !settlements.has(chain)) {
    return res.status(400).json({ error: chains.length === 0 ? "No chains configured" : `chain required: one of ${chains.join(", ")}` });
  }
  try {
    const open = await settlements.get(chain)!.getOpenGameIds();
    res.json({ open });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get open games" });
  }
});

app.get("/games/slots", async (req, res) => {
  if (LOCAL_MODE) {
    try {
      const slots = orchestrator.getSlotDetails();
      return res.json({ slots });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to get slots" });
    }
  }
  const chain = getChain(req);
  if (!chain || !settlements.has(chain)) {
    return res.status(400).json({ error: chains.length === 0 ? "No chains configured" : `chain required: one of ${chains.join(", ")}` });
  }
  try {
    const settlement = settlements.get(chain)!;
    const open = await settlement.getOpenGameIds();
    const slots = await Promise.all(
      open.map(async (id: number) => {
        try {
          const game = await settlement.getGame(id);
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

const STATUS_SETTLED = 5;
const HISTORY_LIMIT = 100;

app.get("/games/history", async (req, res) => {
  if (LOCAL_MODE) return res.json({ history: [] });
  const chain = getChain(req);
  if (!chain || !settlements.has(chain)) {
    return res.status(400).json({ error: chains.length === 0 ? "No chains configured" : `chain required: one of ${chains.join(", ")}` });
  }
  try {
    const settlement = settlements.get(chain)!;
    const total = await settlement.getGameCount();
    if (total === 0) return res.json({ history: [] });
    const start = Math.max(0, total - HISTORY_LIMIT);
    const entries: { gameId: number; winner: string; players: string[]; status: number }[] = [];
    for (let gameId = start; gameId < total; gameId++) {
      const g = await settlement.getGame(gameId);
      if (g.status === STATUS_SETTLED && g.winner) {
        entries.push({ gameId, winner: g.winner, players: g.players, status: g.status });
      }
    }
    entries.reverse();
    res.json({ history: entries });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get history" });
  }
});

app.get("/games/:gameId/state", (req, res) => {
  const chain: Chain = LOCAL_MODE ? "bnb" : (getChain(req) ?? "bnb");
  if (!LOCAL_MODE && !settlements.has(chain)) {
    return res.status(400).json({ error: `chain required: one of ${chains.join(", ")}` });
  }
  try {
    const gameId = parseInt(req.params.gameId, 10);
    if (isNaN(gameId) || gameId < 0) return res.status(400).json({ error: "Invalid gameId" });
    const process = orchestrator.getGameProcess(chain, gameId);
    if (!process || !process.isRunning) {
      return res.status(404).json({ running: false, message: "No active game process for this gameId" });
    }
    const snapshot = process.getSnapshot();
    res.json({ running: true, gameId, round: snapshot.round, turn: snapshot.turn, currentPlayerIndex: snapshot.currentPlayerIndex, status: snapshot.status, phase: snapshot.phase, aliveCount: snapshot.aliveCount, winner: snapshot.winner, lastDice: snapshot.lastDice, snapshot });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get game state" });
  }
});

app.get("/games/:gameId", async (req, res) => {
  const chain = getChain(req);
  if (!chain || !settlements.has(chain)) {
    return res.status(400).json({ error: `chain required: one of ${chains.join(", ")}` });
  }
  try {
    const gameId = parseInt(req.params.gameId, 10);
    if (isNaN(gameId) || gameId < 0) return res.status(400).json({ error: "Invalid gameId" });
    if (LOCAL_MODE || !settlements.has(chain)) {
      return res.status(400).json({ error: "Single game lookup only in on-chain mode" });
    }
    const settlement = settlements.get(chain)!;
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

app.post("/games/create", (req, res) => {
  try {
    const { players, diceSeed } = req.body;
    if (!players || !Array.isArray(players) || players.length !== 4) {
      res.status(400).json({ error: "Provide exactly 4 player addresses in 'players' array" });
      return;
    }
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
    const gameId = orchestrator.createLocalGame(players as [string, string, string, string], diceSeed);
    console.log(`[GM Server] Created local game ${gameId}`);
    res.json({ success: true, gameId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/games/:gameId/spawn", async (req, res) => {
  const chain = getChain(req);
  if (!chain || !settlements.has(chain)) {
    return res.status(400).json({ error: `chain required: one of ${chains.join(", ")}` });
  }
  try {
    const gameId = parseInt(req.params.gameId, 10);
    await orchestrator.spawnGame(chain, gameId);
    res.json({ success: true, gameId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

async function replenishOpenGames(chain?: Chain): Promise<{ created: number; openCount: number }> {
  const result = { created: 0, openCount: 0 };
  if (LOCAL_MODE) return result;
  const toReplenish = chain ? (settlements.has(chain) ? [chain] : []) : chains;
  for (const c of toReplenish) {
    const settlement = settlements.get(c)!;
    try {
      const open = await settlement.getOpenGameIds();
      result.openCount += open.length;
      if (open.length >= OPEN_GAME_TARGET) continue;
      const toCreate = OPEN_GAME_TARGET - open.length;
      console.log(`[GM Server] Replenishing ${c}: ${open.length} -> ${OPEN_GAME_TARGET} (creating ${toCreate})`);
      for (let i = 0; i < toCreate; i++) {
        await settlement.createOpenGame();
        result.created++;
      }
      result.openCount += toCreate;
    } catch (err: any) {
      console.error(`[GM Server] replenishOpenGames ${c} error:`, err?.message || err);
    }
  }
  return result;
}

app.post("/games/replenish", async (req, res) => {
  const chain = getChain(req);
  if (LOCAL_MODE || settlements.size === 0) {
    return res.status(400).json({ error: "Replenish only in on-chain mode" });
  }
  try {
    const result = await replenishOpenGames(chain ?? undefined);
    res.json({ ok: true, created: result.created, openCount: result.openCount });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Replenish failed" });
  }
});

// ========== WebSocket Server ==========

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket: WebSocket, req) => {
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  const gameIdStr = url.searchParams.get("gameId");
  const address = url.searchParams.get("address") || undefined;
  const chain = (url.searchParams.get("chain") || "").toLowerCase() as Chain;

  if (!gameIdStr) {
    socket.send(JSON.stringify({ type: "error", message: "Missing gameId" }));
    socket.close();
    return;
  }

  const gameId = parseInt(gameIdStr, 10);
  const effectiveChain: Chain = (chain === "solana" || chain === "bnb" || chain === "evm") ? chain : (chains.length === 1 ? chains[0] : "bnb");
  if (chains.length > 1 && chain !== "solana" && chain !== "bnb" && chain !== "evm") {
    socket.send(JSON.stringify({ type: "error", message: `chain required: one of ${chains.join(", ")}` }));
    socket.close();
    return;
  }

  orchestrator.handleConnection(socket, effectiveChain, gameId, address).catch((err) => {
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
    for (const c of chains) {
      console.log(`[GM Server] ${c}: ${settlements.get(c)!.address}`);
    }
  }
  orchestrator.startListening();
});

setInterval(() => orchestrator.cleanup(), 5 * 60 * 1000);

if (!LOCAL_MODE && settlements.size > 0) {
  replenishOpenGames();
  setInterval(replenishOpenGames, OPEN_GAME_REPLENISH_INTERVAL_MS);
  orchestrator.onGameEnd = (c?: Chain) => replenishOpenGames(c);
}

export { app, server, orchestrator, chains, settlements };

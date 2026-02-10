import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { Orchestrator } from "./Orchestrator";
import { SettlementClient } from "./SettlementClient";
import dotenv from "dotenv";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3001", 10);
const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const SETTLEMENT_ADDRESS = process.env.SETTLEMENT_ADDRESS || "";
const GM_PRIVATE_KEY = process.env.GM_PRIVATE_KEY || "";

if (!SETTLEMENT_ADDRESS || !GM_PRIVATE_KEY) {
  console.error("Missing SETTLEMENT_ADDRESS or GM_PRIVATE_KEY");
  process.exit(1);
}

// ========== Setup ==========

const settlement = new SettlementClient(RPC_URL, SETTLEMENT_ADDRESS, GM_PRIVATE_KEY);
const orchestrator = new Orchestrator(settlement);

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    activeGames: orchestrator.getActiveGames(),
    gmAddress: settlement.address,
  });
});

// List active games
app.get("/games", (_req, res) => {
  res.json({ games: orchestrator.getActiveGames() });
});

// Manually spawn a game (for testing)
app.post("/games/:gameId/spawn", async (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId, 10);
    await orchestrator.spawnGame(gameId);
    res.json({ success: true, gameId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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
  orchestrator.handleConnection(socket, gameId, address);
});

// ========== Start ==========

server.listen(PORT, () => {
  console.log(`[GM Server] Listening on port ${PORT}`);
  console.log(`[GM Server] Settlement: ${SETTLEMENT_ADDRESS}`);
  console.log(`[GM Server] GM Signer: ${settlement.address}`);
  orchestrator.startListening();
});

// Cleanup every 5 minutes
setInterval(() => orchestrator.cleanup(), 5 * 60 * 1000);

export { app, server, orchestrator };

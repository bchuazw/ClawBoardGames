import { MonopolyEngine, GameAction, GameEvent, GameSnapshot, GameStatus, Phase } from "@clawboardgames/engine";
import { WebSocket } from "ws";
import { SettlementClient } from "./SettlementClient";
import { ethers } from "ethers";

const TURN_TIMEOUT_MS = 10_000; // 10 seconds per agent response
const SPECTATE_DELAY_MS = parseInt(process.env.SPECTATE_DELAY_MS || "0", 10); // delay between actions for spectators

export interface GameProcessConfig {
  gameId: number;
  players: [string, string, string, string];
  diceSeed: string;
  settlement: SettlementClient | null; // null in LOCAL_MODE
  onEnd?: () => void; // called when game ends (e.g. to replace slot with new Lobby)
}

/**
 * A single game process. Runs one Monopoly game to completion.
 * Communicates with agents via WebSocket.
 * Writes checkpoints after each round.
 * Settles on-chain when game ends.
 */
export class GameProcess {
  private engine: MonopolyEngine;
  private config: GameProcessConfig;
  private agentSockets: Map<string, WebSocket> = new Map(); // address -> socket
  private spectatorSockets: Set<WebSocket> = new Set();
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCheckpointRound = -1;
  private events: GameEvent[] = [];
  private running = false;
  private checkpointInProgress = false;

  constructor(config: GameProcessConfig) {
    this.config = config;
    this.engine = new MonopolyEngine(config.players, config.diceSeed);
  }

  /** Restore from a checkpoint (crash recovery). */
  static fromCheckpoint(
    config: GameProcessConfig,
    playersPacked: bigint,
    propertiesPacked: bigint,
    metaPacked: bigint,
  ): GameProcess {
    const process = new GameProcess(config);
    process.engine = MonopolyEngine.fromCheckpoint(
      config.players, config.diceSeed, playersPacked, propertiesPacked, metaPacked,
    );
    return process;
  }

  /** Register an agent's WebSocket connection. */
  connectAgent(address: string, socket: WebSocket): boolean {
    const normalizedAddr = address.toLowerCase();
    const isPlayer = this.config.players.some(p => p.toLowerCase() === normalizedAddr);
    if (!isPlayer) return false;

    this.agentSockets.set(normalizedAddr, socket);

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "action") {
          this.handleAgentAction(normalizedAddr, msg.action as GameAction);
        }
      } catch (err) {
        console.error(`[Game ${this.config.gameId}] Bad message from ${normalizedAddr}:`, err);
      }
    });

    socket.on("close", () => {
      this.agentSockets.delete(normalizedAddr);
    });

    // Send current state to the agent (include gameId so agent always knows which lobby it is in)
    this.sendToAgent(normalizedAddr, {
      type: "snapshot",
      gameId: this.config.gameId,
      snapshot: this.engine.getSnapshot(),
      legalActions: this.engine.getLegalActions(),
    });

    // If all 4 agents connected, start the game loop
    if (this.agentSockets.size === 4 && !this.running) {
      this.start();
    }

    return true;
  }

  /** Register a spectator WebSocket. */
  connectSpectator(socket: WebSocket): void {
    this.spectatorSockets.add(socket);
    socket.on("close", () => this.spectatorSockets.delete(socket));
    socket.send(JSON.stringify({
      type: "snapshot",
      gameId: this.config.gameId,
      snapshot: this.engine.getSnapshot(),
    }));
  }

  /** Start the game loop. Called once all agents are connected. */
  private start(): void {
    this.running = true;
    console.log(`[Game ${this.config.gameId}] Started`);
    this.promptCurrentPlayer();
  }

  /** Send snapshot + legal actions to the current player. Start timeout. */
  private promptCurrentPlayer(): void {
    if (this.engine.state.status !== GameStatus.STARTED) return;

    const currentAddr = this.engine.state.players[this.engine.state.currentPlayerIndex].address.toLowerCase();
    const snapshot = this.engine.getSnapshot();
    const legalActions = this.engine.getLegalActions();

    // Send to current player (include gameId so agent always knows which lobby it is in)
    this.sendToAgent(currentAddr, {
      type: "yourTurn",
      gameId: this.config.gameId,
      snapshot,
      legalActions,
    });

    // Broadcast snapshot to all
    this.broadcastAll({ type: "snapshot", gameId: this.config.gameId, snapshot });

    // Start turn timeout
    this.clearTurnTimer();
    this.turnTimer = setTimeout(() => {
      console.log(`[Game ${this.config.gameId}] Turn timeout for ${currentAddr}, auto-playing`);
      this.doAutoPlay();
    }, TURN_TIMEOUT_MS);
  }

  /** Handle an action submitted by an agent. */
  private handleAgentAction(address: string, action: GameAction): void {
    const currentAddr = this.engine.state.players[this.engine.state.currentPlayerIndex].address.toLowerCase();

    // In auction mode, the current bidder might differ
    if (this.engine.state.auction.active) {
      const bidderAddr = this.engine.state.players[this.engine.state.auction.currentBidder].address.toLowerCase();
      if (address !== bidderAddr) {
        this.sendToAgent(address, { type: "error", message: "Not your turn in auction" });
        return;
      }
    } else if (address !== currentAddr) {
      this.sendToAgent(address, { type: "error", message: "Not your turn" });
      return;
    }

    this.clearTurnTimer();

    try {
      const events = this.engine.executeAction(action);
      this.events.push(...events);

      // Broadcast events (include gameId for consistency)
      this.broadcastAll({ type: "events", gameId: this.config.gameId, events });

      this.afterAction();
    } catch (err: any) {
      this.sendToAgent(address, { type: "error", message: err.message });
      // Re-prompt with timeout
      this.promptCurrentPlayer();
    }
  }

  /** After any action, check game state and proceed. */
  private async afterAction(): Promise<void> {
    // Check if game ended
    if (this.engine.state.status === GameStatus.ENDED) {
      await this.handleGameEnd();
      return;
    }

    // Check if round completed -> write checkpoint
    const currentRound = this.engine.state.currentRound;
    if (currentRound > this.lastCheckpointRound) {
      await this.writeCheckpoint(currentRound);
      this.lastCheckpointRound = currentRound;
    }

    // Spectate delay: pause between actions so spectators can follow
    if (SPECTATE_DELAY_MS > 0) {
      await new Promise(resolve => setTimeout(resolve, SPECTATE_DELAY_MS));
    }

    // Prompt next player (or current if still their turn)
    this.promptCurrentPlayer();
  }

  /** Auto-play for timeout/unresponsive agents. */
  private doAutoPlay(): void {
    const events = this.engine.autoPlay();
    this.events.push(...events);
    this.broadcastAll({ type: "events", events });
    this.afterAction();
  }

  /** Write checkpoint to on-chain contract (skipped in local mode). Serialized to avoid nonce clashes. */
  private async writeCheckpoint(round: number): Promise<void> {
    if (!this.config.settlement) {
      console.log(`[Game ${this.config.gameId}] Checkpoint round ${round} (local mode, skipped on-chain)`);
      return;
    }
    while (this.checkpointInProgress) {
      await new Promise((r) => setTimeout(r, 200));
    }
    this.checkpointInProgress = true;
    try {
      const { playersPacked, propertiesPacked, metaPacked } = this.engine.packForCheckpoint();
      const txHash = await this.config.settlement.writeCheckpoint(
        this.config.gameId, round, playersPacked, propertiesPacked, metaPacked,
      );
      console.log(`[Game ${this.config.gameId}] Checkpoint round ${round}: ${txHash}`);
      await new Promise((r) => setTimeout(r, 300)); // let nonce propagate on RPC
    } catch (err) {
      console.error(`[Game ${this.config.gameId}] Checkpoint write failed:`, err);
    } finally {
      this.checkpointInProgress = false;
    }
  }

  /** Handle game end: settle on-chain first (with retries), then broadcast so agents can withdraw. */
  private async handleGameEnd(): Promise<void> {
    this.clearTurnTimer();
    this.running = false;

    const winnerIndex = this.engine.state.winner;
    const winnerAddr = this.config.players[winnerIndex];

    // Compute game log hash
    const logStr = JSON.stringify(this.events);
    const logHash = ethers.keccak256(ethers.toUtf8Bytes(logStr));

    // Settle on-chain first (so winner can withdraw); then broadcast game end
    if (!this.config.settlement) {
      console.log(`[Game ${this.config.gameId}] Game settled (local mode, skipped on-chain)`);
      this.broadcastAll({
        type: "gameEnded",
        gameId: this.config.gameId,
        winner: winnerIndex,
        winnerAddress: winnerAddr,
        snapshot: this.engine.getSnapshot(),
      });
      this.broadcastAll({ type: "settled", gameId: this.config.gameId, txHash: "local-mode" });
    } else {
      const maxAttempts = 3;
      const delayMs = (attempt: number) => (attempt <= 0 ? 0 : 2000 * Math.pow(2, attempt - 1));
      let lastError: unknown = null;
      let txHash: string | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          const wait = delayMs(attempt);
          console.log(`[Game ${this.config.gameId}] Settlement retry ${attempt + 1}/${maxAttempts} in ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
        }
        try {
          txHash = await this.config.settlement!.settleGame(this.config.gameId, winnerAddr, logHash);
          console.log(`[Game ${this.config.gameId}] Settled on-chain: ${txHash}`);
          break;
        } catch (err) {
          lastError = err;
          const msg = err instanceof Error ? err.message : String(err);
          const reason = (err as { reason?: string })?.reason ?? msg;
          console.error(`[Game ${this.config.gameId}] Settlement attempt ${attempt + 1} failed:`, reason, err);
        }
      }

      this.broadcastAll({
        type: "gameEnded",
        gameId: this.config.gameId,
        winner: winnerIndex,
        winnerAddress: winnerAddr,
        snapshot: this.engine.getSnapshot(),
      });
      if (txHash) {
        this.broadcastAll({ type: "settled", gameId: this.config.gameId, txHash });
      } else {
        const reason = lastError instanceof Error ? lastError.message : (lastError as { reason?: string })?.reason ?? String(lastError);
        this.broadcastAll({
          type: "error",
          gameId: this.config.gameId,
          message: `Settlement failed after ${maxAttempts} attempts; winner cannot withdraw yet. Reason: ${reason}`,
        });
      }
    }
    if (this.config.onEnd) this.config.onEnd();
  }

  // ========== HELPERS ==========

  private sendToAgent(address: string, msg: any): void {
    const socket = this.agentSockets.get(address);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  private broadcastAll(msg: any): void {
    const data = JSON.stringify(msg);
    for (const socket of this.agentSockets.values()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    }
    for (const socket of this.spectatorSockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    }
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  get gameId(): number {
    return this.config.gameId;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Current game snapshot (for GET /games/:gameId/state). */
  getSnapshot(): GameSnapshot {
    return this.engine.getSnapshot();
  }
}

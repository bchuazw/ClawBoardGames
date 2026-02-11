import { GameProcess, GameProcessConfig } from "./GameProcess";
import { SettlementClient } from "./SettlementClient";
import { WebSocket } from "ws";
import { keccak256, toUtf8Bytes } from "ethers";

/**
 * Orchestrator: manages all active game processes.
 * Listens for GameStarted events to spawn new GM processes.
 * Routes WebSocket connections to the right game.
 */
export class Orchestrator {
  private games: Map<number, GameProcess> = new Map();
  private settlement: SettlementClient | null;
  private nextLocalGameId = 0;

  constructor(settlement: SettlementClient | null) {
    this.settlement = settlement;
  }

  /** Start listening for new game events (skipped in local mode). */
  startListening(): void {
    if (!this.settlement) {
      console.log("[Orchestrator] LOCAL_MODE: Skipping chain event listener");
      return;
    }
    console.log("[Orchestrator] Listening for GameStarted events...");
    this.settlement.onGameStarted(async (gameId, diceSeed) => {
      console.log(`[Orchestrator] GameStarted: gameId=${gameId}, diceSeed=${diceSeed}`);
      await this.spawnGame(gameId, diceSeed);
    });
  }

  /** Spawn a new game process (reads game info from chain). */
  async spawnGame(gameId: number, diceSeed?: string): Promise<GameProcess> {
    if (this.games.has(gameId)) {
      console.log(`[Orchestrator] Game ${gameId} already running`);
      return this.games.get(gameId)!;
    }

    if (!this.settlement) {
      throw new Error("Cannot spawnGame from chain in LOCAL_MODE. Use createLocalGame instead.");
    }

    // Read game info from chain
    const gameInfo = await this.settlement.getGame(gameId);
    const seed = diceSeed || gameInfo.diceSeed;
    const players = gameInfo.players as [string, string, string, string];

    const config: GameProcessConfig = {
      gameId,
      players,
      diceSeed: seed,
      settlement: this.settlement,
    };

    // Check if there's a checkpoint to recover from
    const checkpoint = await this.settlement.getCheckpoint(gameId);
    let process: GameProcess;

    if (checkpoint.round > 0) {
      console.log(`[Orchestrator] Recovering game ${gameId} from checkpoint round ${checkpoint.round}`);
      process = GameProcess.fromCheckpoint(
        config,
        checkpoint.playersPacked,
        checkpoint.propertiesPacked,
        checkpoint.metaPacked,
      );
    } else {
      process = new GameProcess(config);
    }

    this.games.set(gameId, process);
    console.log(`[Orchestrator] Game ${gameId} spawned (${this.games.size} active)`);
    return process;
  }

  /**
   * Create a local game (no chain interaction).
   * Returns the assigned gameId.
   */
  createLocalGame(players: [string, string, string, string], diceSeed?: string): number {
    const gameId = this.nextLocalGameId++;
    const seed = diceSeed || keccak256(toUtf8Bytes(`local-game-${gameId}-${Date.now()}`));

    const config: GameProcessConfig = {
      gameId,
      players,
      diceSeed: seed,
      settlement: null,
    };

    const process = new GameProcess(config);
    this.games.set(gameId, process);
    console.log(`[Orchestrator] Local game ${gameId} created for players: ${players.map(p => p.slice(0, 10)).join(", ")}`);
    return gameId;
  }

  /** Route a WebSocket connection to the right game. */
  handleConnection(socket: WebSocket, gameId: number, address?: string): void {
    const process = this.games.get(gameId);

    if (!process) {
      socket.send(JSON.stringify({ type: "error", message: `Game ${gameId} not found` }));
      socket.close();
      return;
    }

    if (address) {
      const connected = process.connectAgent(address, socket);
      if (!connected) {
        socket.send(JSON.stringify({ type: "error", message: "Not a player in this game" }));
        socket.close();
      }
    } else {
      process.connectSpectator(socket);
    }
  }

  /** Get all active game IDs. */
  getActiveGames(): number[] {
    return Array.from(this.games.keys());
  }

  /** Clean up finished games. */
  cleanup(): void {
    for (const [id, process] of this.games) {
      if (!process.isRunning) {
        this.games.delete(id);
      }
    }
  }
}

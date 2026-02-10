import { GameProcess, GameProcessConfig } from "./GameProcess";
import { SettlementClient } from "./SettlementClient";
import { WebSocket } from "ws";

/**
 * Orchestrator: manages all active game processes.
 * Listens for GameStarted events to spawn new GM processes.
 * Routes WebSocket connections to the right game.
 */
export class Orchestrator {
  private games: Map<number, GameProcess> = new Map();
  private settlement: SettlementClient;

  constructor(settlement: SettlementClient) {
    this.settlement = settlement;
  }

  /** Start listening for new game events. */
  startListening(): void {
    console.log("[Orchestrator] Listening for GameStarted events...");
    this.settlement.onGameStarted(async (gameId, diceSeed) => {
      console.log(`[Orchestrator] GameStarted: gameId=${gameId}, diceSeed=${diceSeed}`);
      await this.spawnGame(gameId, diceSeed);
    });
  }

  /** Spawn a new game process. */
  async spawnGame(gameId: number, diceSeed?: string): Promise<GameProcess> {
    if (this.games.has(gameId)) {
      console.log(`[Orchestrator] Game ${gameId} already running`);
      return this.games.get(gameId)!;
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

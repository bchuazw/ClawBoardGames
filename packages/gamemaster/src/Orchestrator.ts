import { GameProcess, GameProcessConfig } from "./GameProcess";
import { SettlementClient } from "./SettlementClient";
import { WebSocket } from "ws";
import { keccak256, toUtf8Bytes } from "ethers";

const NUM_LOCAL_SLOTS = 10;

/** Lobby: holds 0–4 (address, WebSocket) until 4th joins, then becomes a game. */
interface LobbyEntry {
  address: string;
  socket: WebSocket;
}

class Lobby {
  readonly gameId: number;
  entries: LobbyEntry[] = [];
  spectatorSockets: Set<WebSocket> = new Set();

  constructor(gameId: number) {
    this.gameId = gameId;
  }

  get size(): number {
    return this.entries.length;
  }

  hasAddress(addr: string): boolean {
    const n = addr.toLowerCase();
    return this.entries.some(e => e.address.toLowerCase() === n);
  }

  add(address: string, socket: WebSocket): boolean {
    if (this.size >= 4 || this.hasAddress(address)) return false;
    this.entries.push({ address, socket });
    return true;
  }

  addSpectator(socket: WebSocket): void {
    this.spectatorSockets.add(socket);
    socket.on("close", () => this.spectatorSockets.delete(socket));
  }

  getPlayersAndSockets(): [string, string, string, string] | null {
    if (this.entries.length !== 4) return null;
    const addrs = this.entries.map(e => e.address) as [string, string, string, string];
    return addrs;
  }
}

type LocalSlot = Lobby | GameProcess;

/**
 * Orchestrator: manages all active game processes.
 * In local mode: 10 fixed slots (0..9), each a Lobby or GameProcess. Game auto-starts at 4/4.
 * In on-chain mode: games Map keyed by gameId; listens for GameStarted to spawn.
 */
export class Orchestrator {
  private games: Map<number, GameProcess> = new Map();
  /** Local mode only: slots 0..NUM_LOCAL_SLOTS-1, each Lobby or GameProcess */
  private slots: Map<number, LocalSlot> = new Map();
  private settlement: SettlementClient | null;
  private nextLocalGameId: number;

  constructor(settlement: SettlementClient | null) {
    this.settlement = settlement;
    this.nextLocalGameId = NUM_LOCAL_SLOTS; // 10+ for createLocalGame-created games
    if (!settlement) {
      for (let i = 0; i < NUM_LOCAL_SLOTS; i++) {
        this.slots.set(i, new Lobby(i));
      }
    }
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

  /** Route a WebSocket connection to the right game or lobby. */
  async handleConnection(socket: WebSocket, gameId: number, address?: string): Promise<void> {
    // Local mode: slots 0..9 are lobbies or in-progress games
    if (!this.settlement && gameId >= 0 && gameId < NUM_LOCAL_SLOTS) {
      const slot = this.slots.get(gameId)!;
      if (slot instanceof Lobby) {
        if (!address) {
          slot.addSpectator(socket);
          return;
        }
        const added = slot.add(address, socket);
        if (!added) {
          socket.send(JSON.stringify({ type: "error", message: "Lobby full or address already in lobby" }));
          socket.close();
          return;
        }
        if (slot.size === 4) {
          const players = slot.getPlayersAndSockets()!;
          const seed = keccak256(toUtf8Bytes(`local-slot-${gameId}-${Date.now()}`));
          const config: GameProcessConfig = {
            gameId,
            players,
            diceSeed: seed,
            settlement: null,
            onEnd: () => {
              this.slots.set(gameId, new Lobby(gameId));
              console.log(`[Orchestrator] Slot ${gameId} reset to lobby`);
            },
          };
          const process = new GameProcess(config);
          for (let i = 0; i < 4; i++) {
            process.connectAgent(players[i], slot.entries[i].socket);
          }
          for (const spec of slot.spectatorSockets) {
            if (spec.readyState === WebSocket.OPEN) process.connectSpectator(spec);
          }
          this.slots.set(gameId, process);
          console.log(`[Orchestrator] Slot ${gameId} started with 4 players`);
        }
      } else {
        const process = slot;
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
      return;
    }

    // Local mode: gameId >= 10 from createLocalGame
    let process = this.games.get(gameId);

    if (!process && this.settlement) {
      try {
        const gameInfo = await this.settlement.getGame(gameId);
        if (gameInfo.status >= 4) { // STARTED or later (OPEN=1, DEPOSITING=2, REVEALING=3)
          await this.spawnGame(gameId);
          process = this.games.get(gameId);
        }
      } catch (_) {
        /* ignore */
      }
    }

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

  /** Get all active game IDs. In local mode returns [0..9] (slot ids). */
  getActiveGames(): number[] {
    if (!this.settlement) {
      return Array.from({ length: NUM_LOCAL_SLOTS }, (_, i) => i);
    }
    return Array.from(this.games.keys());
  }

  /** Get open slot IDs (local mode: [0..9]; on-chain: from contract via GET /games/open). */
  getOpenSlotIds(): number[] {
    if (!this.settlement) {
      return Array.from({ length: NUM_LOCAL_SLOTS }, (_, i) => i);
    }
    return [];
  }

  /** Get slot details for UI (local mode only): id, status (waiting|active), playerCount for waiting lobbies. */
  getSlotDetails(): { id: number; status: "waiting" | "active"; playerCount?: number }[] {
    if (this.settlement) return [];
    const out: { id: number; status: "waiting" | "active"; playerCount?: number }[] = [];
    for (let i = 0; i < NUM_LOCAL_SLOTS; i++) {
      const slot = this.slots.get(i);
      if (!slot) {
        out.push({ id: i, status: "waiting", playerCount: 0 });
        continue;
      }
      if (slot instanceof Lobby) {
        out.push({ id: i, status: "waiting", playerCount: slot.size });
      } else {
        out.push({ id: i, status: "active" });
      }
    }
    return out;
  }

  /** Get the running game process for a gameId, if any (on-chain: from games Map; local: from slots when it's a GameProcess). */
  getGameProcess(gameId: number): GameProcess | null {
    if (this.settlement) {
      const p = this.games.get(gameId);
      return p && p.isRunning ? p : null;
    }
    const slot = this.slots.get(gameId);
    return slot instanceof GameProcess && slot.isRunning ? slot : null;
  }

  /** Clean up finished games (on-chain only; local slots are reset via onEnd). */
  cleanup(): void {
    for (const [id, process] of this.games) {
      if (!process.isRunning) {
        this.games.delete(id);
      }
    }
  }
}

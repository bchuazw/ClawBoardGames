import { GameProcess, GameProcessConfig } from "./GameProcess";
import { ISettlementClient } from "./ISettlementClient";
import { WebSocket } from "ws";
import { keccak256, toUtf8Bytes } from "ethers";

const NUM_LOCAL_SLOTS = 10;

export type Chain = "solana" | "bnb" | "evm";

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

function gameKey(chain: Chain, gameId: number): string {
  return `${chain}:${gameId}`;
}

/**
 * Orchestrator: manages all active game processes across multiple chains.
 * In local mode: 10 fixed slots (0..9), each a Lobby or GameProcess.
 * In on-chain mode: games Map keyed by "chain:gameId"; listens for GameStarted per chain.
 */
export class Orchestrator {
  /** On-chain: key = "chain:gameId" */
  private games: Map<string, GameProcess> = new Map();
  /** Local mode only: slots 0..NUM_LOCAL_SLOTS-1 */
  private slots: Map<number, LocalSlot> = new Map();
  private settlements: Map<Chain, ISettlementClient>;
  private nextLocalGameId: number;
  /** Called when an on-chain game ends (chain passed for replenish). */
  onGameEnd?: (chain?: Chain) => void;

  constructor(settlements: Map<Chain, ISettlementClient>) {
    this.settlements = settlements;
    this.nextLocalGameId = NUM_LOCAL_SLOTS;
    if (settlements.size === 0) {
      for (let i = 0; i < NUM_LOCAL_SLOTS; i++) {
        this.slots.set(i, new Lobby(i));
      }
    }
  }

  /** Start listening for new game events (skipped in local mode). */
  startListening(): void {
    if (this.settlements.size === 0) {
      console.log("[Orchestrator] LOCAL_MODE: Skipping chain event listener");
      return;
    }
    console.log("[Orchestrator] Listening for GameStarted events...");
    for (const [chain, settlement] of this.settlements) {
      settlement.onGameStarted(async (gameId, diceSeed) => {
        console.log(`[Orchestrator] GameStarted ${chain}: gameId=${gameId}, diceSeed=${diceSeed}`);
        await this.spawnGame(chain, gameId, diceSeed);
      });
    }
  }

  /** Spawn a new game process (reads game info from chain). */
  async spawnGame(chain: Chain, gameId: number, diceSeed?: string): Promise<GameProcess> {
    const key = gameKey(chain, gameId);
    if (this.games.has(key)) {
      console.log(`[Orchestrator] Game ${chain}:${gameId} already running`);
      return this.games.get(key)!;
    }

    const settlement = this.settlements.get(chain);
    if (!settlement) {
      throw new Error(`No settlement for chain ${chain}`);
    }

    const gameInfo = await settlement.getGame(gameId);
    const seed = diceSeed || gameInfo.diceSeed;
    const players = gameInfo.players as [string, string, string, string];

    const config: GameProcessConfig = {
      gameId,
      players,
      diceSeed: seed,
      settlement,
      onEnd: () => this.onGameEnd?.(chain),
    };

    const checkpoint = await settlement.getCheckpoint(gameId);
    let process: GameProcess;

    if (checkpoint.round > 0) {
      console.log(`[Orchestrator] Recovering game ${chain}:${gameId} from checkpoint round ${checkpoint.round}`);
      process = GameProcess.fromCheckpoint(
        config,
        checkpoint.playersPacked,
        checkpoint.propertiesPacked,
        checkpoint.metaPacked,
      );
    } else {
      process = new GameProcess(config);
    }

    this.games.set(key, process);
    console.log(`[Orchestrator] Game ${chain}:${gameId} spawned (${this.games.size} active)`);
    return process;
  }

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
    this.games.set(gameKey("bnb", gameId), process); // local games use dummy chain key
    console.log(`[Orchestrator] Local game ${gameId} created for players: ${players.map(p => p.slice(0, 10)).join(", ")}`);
    return gameId;
  }

  /** Route a WebSocket connection to the right game or lobby. */
  async handleConnection(socket: WebSocket, chain: Chain, gameId: number, address?: string): Promise<void> {
    // Local mode: slots 0..9 are lobbies or in-progress games
    if (this.settlements.size === 0 && gameId >= 0 && gameId < NUM_LOCAL_SLOTS) {
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

    let process = this.games.get(gameKey(chain, gameId));
    const settlement = this.settlements.get(chain);

    if (!process && settlement) {
      try {
        const gameInfo = await settlement.getGame(gameId);
        if (gameInfo.status >= 4) {
          await this.spawnGame(chain, gameId);
          process = this.games.get(gameKey(chain, gameId))!;
        }
      } catch (_) {
        /* ignore */
      }
    }

    if (!process) {
      socket.send(JSON.stringify({ type: "error", message: `Game ${chain}:${gameId} not found` }));
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

  getActiveGames(chain?: Chain): number[] {
    if (this.settlements.size === 0) {
      return Array.from({ length: NUM_LOCAL_SLOTS }, (_, i) => i);
    }
    const keys = Array.from(this.games.keys());
    if (chain) {
      return keys.filter(k => k.startsWith(chain + ":")).map(k => parseInt(k.split(":")[1], 10));
    }
    return keys.map(k => parseInt(k.split(":")[1], 10));
  }

  getGamesAndDisconnected(chain?: Chain): { games: number[]; disconnected: number[] } {
    const games = this.getActiveGames(chain);
    const disconnected = games.filter((id) => {
      const c: Chain | undefined = chain ?? (Array.from(this.games.keys()).find(k => k.endsWith(":" + id))?.split(":")[0] as Chain);
      if (!c) return false;
      const p = this.getGameProcess(c, id);
      return p?.allAgentsDisconnected === true;
    });
    return { games, disconnected };
  }

  getOpenSlotIds(): number[] {
    if (this.settlements.size === 0) {
      return Array.from({ length: NUM_LOCAL_SLOTS }, (_, i) => i);
    }
    return [];
  }

  getSlotDetails(): { id: number; status: "waiting" | "active"; playerCount?: number; disconnected?: boolean }[] {
    if (this.settlements.size > 0) return [];
    const out: { id: number; status: "waiting" | "active"; playerCount?: number; disconnected?: boolean }[] = [];
    for (let i = 0; i < NUM_LOCAL_SLOTS; i++) {
      const slot = this.slots.get(i);
      if (!slot) {
        out.push({ id: i, status: "waiting", playerCount: 0 });
        continue;
      }
      if (slot instanceof Lobby) {
        out.push({ id: i, status: "waiting", playerCount: slot.size });
      } else {
        out.push({ id: i, status: "active", disconnected: slot.allAgentsDisconnected });
      }
    }
    return out;
  }

  getGameProcess(chain: Chain, gameId: number): GameProcess | null {
    if (this.settlements.size === 0) {
      const slot = this.slots.get(gameId);
      return slot instanceof GameProcess && slot.isRunning ? slot : null;
    }
    const p = this.games.get(gameKey(chain, gameId));
    return p && p.isRunning ? p : null;
  }

  cleanup(): void {
    for (const [key, process] of this.games) {
      if (!process.isRunning) {
        this.games.delete(key);
      }
    }
  }
}

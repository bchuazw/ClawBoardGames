import WebSocket from "ws";
import { SettlementClient } from "./SettlementClient";
import { GameAction, GameSnapshot } from "@clawboardgames/engine";

export interface AgentPolicy {
  /** Given the current state and legal actions, return the action to take. */
  decide(snapshot: GameSnapshot, legalActions: GameAction[]): GameAction;
}

export interface BnbAgentConfig {
  chain: "bnb";
  /** Agent's private key (hex string). */
  privateKey: string;
  /** RPC URL (BNB Chain Testnet / Mainnet). */
  rpcUrl: string;
  /** MonopolySettlement contract address. */
  settlementAddress: string;
  /** GM WebSocket URL (e.g. ws://localhost:3001/ws). */
  gmWsUrl: string;
  /** Agent policy: decides what to do each turn. */
  policy: AgentPolicy;
}

export interface SolanaAgentConfig {
  chain: "solana";
  /** Agent's keypair as a JSON byte array string, e.g. "[1,2,3,...]". */
  keypairJson: string;
  /** Solana RPC URL (e.g. https://api.devnet.solana.com). */
  rpcUrl: string;
  /** Deployed Anchor program ID. */
  programId: string;
  /** GM WebSocket URL. */
  gmWsUrl: string;
  /** Agent policy: decides what to do each turn. */
  policy: AgentPolicy;
}

/** Legacy config (BNB only, no `chain` field) for backward compatibility. */
export interface AgentConfig {
  /** Agent's private key (hex string). */
  privateKey: string;
  /** RPC URL (BNB Chain Testnet / Mainnet). */
  rpcUrl: string;
  /** MonopolySettlement contract address. */
  settlementAddress: string;
  /** GM WebSocket URL (e.g. ws://localhost:3001/ws). */
  gmWsUrl: string;
  /** Agent policy: decides what to do each turn. */
  policy: AgentPolicy;
}

export type UnifiedAgentConfig = BnbAgentConfig | SolanaAgentConfig | AgentConfig;

/** Response from GM GET /games/:gameId (lobby status, settlement, winner). */
export interface GameStatusFromGM {
  gameId: number;
  status: number;
  statusLabel: string;
  settlementConcluded: boolean;
  winnerCanWithdraw: boolean;
  winnerClaimed?: boolean;
  players: string[];
  depositCount: number;
  winner: string | null;
}

/** Response from GM GET /games/:gameId/state (in-progress game: round, turn, snapshot). */
export interface GameStateFromGM {
  running: boolean;
  gameId: number;
  round: number;
  turn: number;
  currentPlayerIndex: number;
  status: string;
  phase: string;
  aliveCount: number;
  winner: number;
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  snapshot: GameSnapshot;
}

/**
 * OpenClawAgent: the main agent class for playing ClawBoardGames v2.
 *
 * Usage (on-chain):
 *   1. agent = new OpenClawAgent(config)
 *   2. openIds = await agent.getOpenGameIds(); gameId = openIds[0]  // pick an open slot
 *   3. agent.depositAndCommit(gameId)       // pay + commit
 *   4. agent.revealSeed(gameId)             // reveal secret
 *   5. agent.connectAndPlay(gameId)         // join WebSocket, auto-play
 *   6. (game ends) agent.withdraw(gameId)   // claim winnings
 *
 * Usage (local): getOpenGameIds() returns [0..9]; connectAndPlay(gameId) with no deposit/reveal.
 */
export class OpenClawAgent {
  private settlement: SettlementClient | { address: string; generateSecret(): any; depositAndCommit(gameId: number): Promise<string>; revealSeed(gameId: number): Promise<string>; withdraw(gameId: number): Promise<string>; getGame(gameId: number): Promise<any> };
  private _config: UnifiedAgentConfig;
  private ws: WebSocket | null = null;
  private latestSnapshot: GameSnapshot | null = null;
  private gameActive = false;
  private _chain: "bnb" | "solana";

  constructor(config: UnifiedAgentConfig) {
    this._config = config;

    if ("chain" in config && config.chain === "solana") {
      this._chain = "solana";
      const { SolanaSettlementClient } = require("./SolanaSettlementClient");
      this.settlement = new SolanaSettlementClient(config.rpcUrl, config.programId, config.keypairJson);
    } else {
      this._chain = "bnb";
      const c = config as AgentConfig | BnbAgentConfig;
      this.settlement = new SettlementClient(c.rpcUrl, c.settlementAddress, c.privateKey);
    }
  }

  get chain(): "bnb" | "solana" { return this._chain; }

  /** Agent's wallet address (EVM hex or Solana base58). */
  get address(): string {
    return this.settlement.address;
  }

  private gmRestBase(): string {
    const wsUrl = this._config.gmWsUrl;
    const protocol = wsUrl.startsWith("wss://") ? "https" : "http";
    return wsUrl.replace(/^wss?:\/\//, `${protocol}://`).replace(/\/ws.*$/, "");
  }

  /**
   * Get open game IDs from the GM (GET /games/open).
   * On-chain: IDs of games that accept new players (first 4 to deposit get slots).
   * Local: [0..9] (10 fixed slots).
   */
  async getOpenGameIds(): Promise<number[]> {
    const res = await fetch(`${this.gmRestBase()}/games/open`);
    if (!res.ok) throw new Error(`GET /games/open failed: ${res.status}`);
    const body = (await res.json()) as { open?: number[] };
    return body.open ?? [];
  }

  /**
   * Get game (lobby) status from the GM (GET /games/:gameId).
   * Use this when the game has ended to check settlement and whether the winner can withdraw.
   * Source of truth for settlementConcluded, winnerCanWithdraw, winnerClaimed.
   */
  async getGameStatus(gameId: number): Promise<GameStatusFromGM> {
    const res = await fetch(`${this.gmRestBase()}/games/${gameId}`);
    if (!res.ok) throw new Error(`GET /games/${gameId} failed: ${res.status}`);
    return res.json() as Promise<GameStatusFromGM>;
  }

  /**
   * Get in-progress game state from the GM (GET /games/:gameId/state).
   * Returns round, turn, currentPlayerIndex, snapshot while the game is running.
   * Use this to check if a game is progressing (e.g. poll and see turn/round increase).
   * Resolves with null if the GM has no active process for this game (404).
   */
  async getGameState(gameId: number): Promise<GameStateFromGM | null> {
    const res = await fetch(`${this.gmRestBase()}/games/${gameId}/state`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET /games/${gameId}/state failed: ${res.status}`);
    const body = (await res.json()) as GameStateFromGM & { running?: boolean };
    return body.running === true ? body : null;
  }

  // ========== PRE-GAME ON-CHAIN STEPS ==========

  /**
   * Step 1: Deposit 0.001 BNB (native token) + commit a random dice secret.
   * Returns the transaction hash.
   */
  async depositAndCommit(gameId: number): Promise<string> {
    console.log(`[Agent ${this.address.slice(0, 8)}] Depositing + committing for game ${gameId}`);
    this.settlement.generateSecret();
    const txHash = await this.settlement.depositAndCommit(gameId);
    console.log(`[Agent ${this.address.slice(0, 8)}] Deposit+commit tx: ${txHash}`);
    return txHash;
  }

  /**
   * Step 2: Reveal the dice secret.
   * Returns the transaction hash.
   */
  async revealSeed(gameId: number): Promise<string> {
    console.log(`[Agent ${this.address.slice(0, 8)}] Revealing seed for game ${gameId}`);
    const txHash = await this.settlement.revealSeed(gameId);
    console.log(`[Agent ${this.address.slice(0, 8)}] Reveal tx: ${txHash}`);
    return txHash;
  }

  // ========== GAMEPLAY (WEBSOCKET) ==========

  /**
   * Step 3: Connect to GM WebSocket and auto-play using the policy.
   * Local mode: use gameId 0–9; when 4 players join the same slot, the game starts (no deposit/reveal).
   * Returns a promise that resolves when the game ends.
   */
  connectAndPlay(gameId: number): Promise<GameSnapshot> {
    return new Promise((resolve, reject) => {
      const url = `${this._config.gmWsUrl}?gameId=${gameId}&address=${this.address}`;
      this.ws = new WebSocket(url);
      this.gameActive = true;

      this.ws.on("open", () => {
        console.log(`[Agent ${this.address.slice(0, 8)}] Connected to GM for game ${gameId}`);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg, resolve);
        } catch (err) {
          console.error(`[Agent ${this.address.slice(0, 8)}] Bad message:`, err);
        }
      });

      this.ws.on("close", () => {
        console.log(`[Agent ${this.address.slice(0, 8)}] WebSocket closed`);
        if (this.gameActive) {
          reject(new Error("WebSocket closed unexpectedly"));
        }
      });

      this.ws.on("error", (err: Error) => {
        console.error(`[Agent ${this.address.slice(0, 8)}] WebSocket error:`, err);
        reject(err);
      });
    });
  }

  // ========== POST-GAME ==========

  /**
   * Step 4: Withdraw winnings (if winner).
   */
  async withdraw(gameId: number): Promise<string> {
    console.log(`[Agent ${this.address.slice(0, 8)}] Withdrawing from game ${gameId}`);
    const txHash = await this.settlement.withdraw(gameId);
    console.log(`[Agent ${this.address.slice(0, 8)}] Withdraw tx: ${txHash}`);
    return txHash;
  }

  // ========== FULL GAME RUNNER ==========

  /**
   * Run the full game lifecycle: deposit, commit, reveal, play, withdraw.
   * Use getOpenGameIds() first to get an open gameId, then runFullGame(gameId).
   * Local mode: use connectAndPlay(gameId) with gameId 0–9 (no deposit/reveal); when 4 join same slot, game starts.
   */
  async runFullGame(gameId: number): Promise<GameSnapshot> {
    if (gameId == null || typeof gameId !== "number" || gameId < 0) {
      throw new Error("Invalid gameId; use getOpenGameIds() and pick a valid id, or runFullGameOnAnyOpenSlot()");
    }
    // Step 1: Deposit + commit
    await this.depositAndCommit(gameId);

    // Step 2: Wait for reveal phase, then reveal (small jitter to avoid nonce clashes when 4 agents reveal in parallel)
    await this.waitForRevealPhase(gameId);
    await sleep(500 + Math.floor(Math.random() * 1500));
    await this.revealSeed(gameId);

    // Step 3: Wait for game to start, give GM time to spawn process, then connect and play
    await this.waitForGameStart(gameId);
    await sleep(2500); // let GM receive GameStarted and spawn GameProcess
    const finalSnapshot = await this.connectAndPlay(gameId);

    // Step 4: If we won, withdraw
    if (finalSnapshot.winner >= 0) {
      const winnerAddr = finalSnapshot.players[finalSnapshot.winner]?.address;
      if (winnerAddr?.toLowerCase() === this.address.toLowerCase()) {
        await this.withdraw(gameId);
      }
    }

    return finalSnapshot;
  }

  /**
   * Get open game IDs, pick one (by default the first), then run the full on-chain game.
   * Convenience helper for "join any open game and play."
   */
  async runFullGameOnAnyOpenSlot(pickIndex = 0): Promise<GameSnapshot> {
    const open = await this.getOpenGameIds();
    if (open.length === 0) throw new Error("No open games available");
    const gameId = open[Math.min(pickIndex, open.length - 1)];
    return this.runFullGame(gameId);
  }

  // ========== PRIVATE ==========

  private handleMessage(msg: any, onGameEnd: (snapshot: GameSnapshot) => void): void {
    switch (msg.type) {
      case "snapshot":
        this.latestSnapshot = msg.snapshot;
        break;

      case "yourTurn": {
        this.latestSnapshot = msg.snapshot;
        const actions: GameAction[] = msg.legalActions;
        if (actions.length > 0) {
          const action = this._config.policy.decide(msg.snapshot, actions);
          this.sendAction(action);
        }
        break;
      }

      case "events":
        // Events are informational, no action needed
        break;

      case "gameEnded":
        this.latestSnapshot = msg.snapshot;
        this.gameActive = false;
        if (this.ws) this.ws.close();
        onGameEnd(msg.snapshot);
        break;

      case "settled":
        console.log(`[Agent ${this.address.slice(0, 8)}] Game settled on-chain: ${msg.txHash}`);
        break;

      case "error":
        console.error(`[Agent ${this.address.slice(0, 8)}] GM error: ${msg.message}`);
        break;
    }
  }

  private sendAction(action: GameAction): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "action", action }));
    }
  }

  private async waitForRevealPhase(gameId: number, maxWaitMs = 60000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const game = await this.settlement.getGame(gameId);
      if (game.status >= 3) return; // REVEALING or later (OPEN=1, DEPOSITING=2)
      await sleep(2000);
    }
    throw new Error("Timed out waiting for reveal phase");
  }

  private async waitForGameStart(gameId: number, maxWaitMs = 60000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const game = await this.settlement.getGame(gameId);
      if (game.status >= 4) return; // STARTED or later
      await sleep(2000);
    }
    throw new Error("Timed out waiting for game start");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

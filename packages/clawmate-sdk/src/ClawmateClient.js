import { io } from "socket.io-client";
import { EventEmitter } from "events";
import * as signing from "./signing.js";
import { createLobbyOnChain, joinLobbyOnChain } from "./escrow.js";
import { monToWei } from "./utils.js";

/**
 * ClawMate SDK client for OpenClaw agents and bots.
 * Connects to the ClawMate backend via REST + Socket.IO; all authenticated actions use the provided signer.
 *
 * @example
 * const { Wallet } = require('ethers');
 * const client = new ClawmateClient({
 *   baseUrl: 'http://localhost:4000',
 *   signer: new Wallet(process.env.PRIVATE_KEY, provider),
 * });
 * await client.connect();
 * client.on('lobby_joined_yours', (data) => { ... });
 * const lobbies = await client.getLobbies();
 * await client.createLobby({ betAmountWei: '0' });
 */
export class ClawmateClient extends EventEmitter {
  /**
   * @param {{ baseUrl: string, signer: import('ethers').Signer }} options
   *   - baseUrl: backend base URL (e.g. http://localhost:4000)
   *   - signer: ethers Signer (e.g. Wallet) for signing messages; must have signMessage()
   */
  constructor({ baseUrl, signer }) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.signer = signer;
    this.socket = null;
    this.connected = false;
  }

  _fetch(path, options = {}) {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    return fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  }

  async _json(path, options = {}) {
    const res = await this._fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  async _registerWallet() {
    const { message, signature } = await signing.signRegisterWallet(this.signer);
    this.socket.emit("register_wallet", { message, signature });
  }

  /**
   * Register wallet with the real-time socket (required before joinGame / makeMove).
   * Call once after construction; call again after reconnect if needed.
   */
  async connect() {
    if (this.socket?.connected) {
      await this._registerWallet();
      return;
    }
    this.socket = io(this.baseUrl, { path: "/socket.io", transports: ["websocket", "polling"] });

    this.socket.on("connect", () => {
      this.connected = true;
      this.emit("connect");
    });
    this.socket.on("disconnect", (reason) => {
      this.connected = false;
      this.emit("disconnect", reason);
    });
    this.socket.on("register_wallet_error", (data) => this.emit("register_wallet_error", data));
    this.socket.on("join_lobby_error", (data) => this.emit("join_lobby_error", data));
    this.socket.on("move_error", (data) => this.emit("move_error", data));
    this.socket.on("move", (data) => this.emit("move", data));
    this.socket.on("lobby_joined", (data) => this.emit("lobby_joined", data));
    this.socket.on("lobby_joined_yours", (data) => this.emit("lobby_joined_yours", data));
    this.socket.on("game_state", (data) => this.emit("game_state", data));
    this.socket.on("spectate_error", (data) => this.emit("spectate_error", data));
    this.socket.on("your_turn", (data) => this.emit("your_turn", data));
    // Draw events
    this.socket.on("draw_offered", (data) => this.emit("draw_offered", data));
    this.socket.on("draw_declined", (data) => this.emit("draw_declined", data));
    this.socket.on("draw_error", (data) => this.emit("draw_error", data));

    await new Promise((resolve, reject) => {
      const done = () => {
        this.socket.off("register_wallet_error", onErr);
        resolve();
      };
      const onErr = (err) => {
        this.socket.off("connect", onConnect);
        reject(new Error(err?.reason || "register_wallet failed"));
      };
      const onConnect = () => {
        this._registerWallet()
          .then(done)
          .catch((e) => {
            this.socket.off("register_wallet_error", onErr);
            reject(e);
          });
      };
      this.socket.once("connect", onConnect);
      this.socket.once("register_wallet_error", onErr);
      this.socket.connect();
    });
  }

  /** Disconnect socket. */
  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
  }

  /** GET /api/lobbies — list open (waiting) lobbies. */
  async getLobbies() {
    const data = await this._json("/api/lobbies");
    return data.lobbies || [];
  }

  /** GET /api/lobbies?status=playing — list live (in-progress) games. */
  async getLiveGames() {
    const data = await this._json("/api/lobbies?status=playing");
    return data.lobbies || [];
  }

  /** GET /api/lobbies/:lobbyId — fetch one lobby. */
  async getLobby(lobbyId) {
    return this._json(`/api/lobbies/${lobbyId}`);
  }

  /**
   * Set the display name for this wallet on the leaderboard (3–20 chars; profanity not allowed).
   * Call this so your agent appears under a chosen name instead of wallet address.
   * @param {string} username
   * @returns {Promise<{ ok: boolean, username: string }>}
   */
  async setUsername(username) {
    const trimmed = typeof username === "string" ? username.trim() : "";
    if (trimmed.length < 3 || trimmed.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      throw new Error("Username must be 3–20 characters, letters, numbers, underscore, or hyphen");
    }
    const { message, signature } = await signing.signSetUsername(this.signer, trimmed);
    return this._json("/api/profile/username", {
      method: "POST",
      body: JSON.stringify({ message, signature, username: trimmed }),
    });
  }

  /**
   * POST /api/lobbies — create a lobby.
   * @param {{ betAmountWei: string, contractGameId?: number | null }} opts
   *   - betAmountWei: bet in wei (e.g. '0' for no wager)
   *   - contractGameId: optional on-chain game id if you created one via escrow
   */
  async createLobby(opts = {}) {
    const betAmount = opts.betAmountWei ?? "0";
    const contractGameId = opts.contractGameId ?? null;
    const { message, signature } = await signing.signCreateLobby(this.signer, { betAmount, contractGameId });
    return this._json("/api/lobbies", {
      method: "POST",
      body: JSON.stringify({ message, signature, betAmount, contractGameId }),
    });
  }

  /**
   * POST /api/lobbies/:lobbyId/join — join a lobby as player 2.
   * Optionally do on-chain join first (escrow) then call this.
   */
  async joinLobby(lobbyId) {
    const { message, signature } = await signing.signJoinLobby(this.signer, lobbyId);
    return this._json(`/api/lobbies/${lobbyId}/join`, {
      method: "POST",
      body: JSON.stringify({ message, signature }),
    });
  }

  /**
   * Join an existing lobby with the given wager, or create one if none match.
   * Specify wager in MON (e.g. 0.001) or wei; if omitted, uses 0 (no wager).
   * For wagered games (betMon > 0 or betWei > 0), pass contractAddress so the SDK can do on-chain join/create.
   *
   * @param {{ betMon?: number | string, betWei?: string, contractAddress?: string }} options
   *   - betMon: wager in MON (e.g. 0.001). Ignored if betWei is set.
   *   - betWei: wager in wei (string). Overrides betMon.
   *   - contractAddress: ChessBetEscrow contract address. Required when wager > 0.
   * @returns {{ lobby: object, created: boolean }} lobby object and true if a new lobby was created
   */
  async joinOrCreateLobby(options = {}) {
    const betWei =
      options.betWei != null && options.betWei !== ""
        ? String(options.betWei)
        : monToWei(options.betMon ?? 0);
    const hasWager = BigInt(betWei) > 0n;
    if (hasWager && !options.contractAddress) {
      throw new Error("contractAddress is required when wager > 0 (for on-chain escrow)");
    }

    // Get our own wallet address to avoid matching our own lobbies
    const myAddress = (await this.signer.getAddress()).toLowerCase();

    const lobbies = await this.getLobbies();
    // Match lobbies with exact same betAmount that we did NOT create
    const match = lobbies.find((l) => {
      if (l.betAmount !== betWei) return false;
      // Don't match our own lobby
      if (l.player1Wallet?.toLowerCase() === myAddress) return false;
      // For wagered games, require a contractGameId (on-chain escrow)
      if (hasWager && l.contractGameId == null) return false;
      return true;
    });

    if (match) {
      if (hasWager) {
        await joinLobbyOnChain({
          signer: this.signer,
          contractAddress: options.contractAddress,
          gameId: match.contractGameId,
          betWei: match.betAmount,
        });
      }
      await this.joinLobby(match.lobbyId);
      this.joinGame(match.lobbyId);
      const lobby = await this.getLobby(match.lobbyId);
      return { lobby, created: false };
    }

    let lobby;
    if (hasWager) {
      const contractGameId = await createLobbyOnChain({
        signer: this.signer,
        contractAddress: options.contractAddress,
        betWei,
      });
      lobby = await this.createLobby({ betAmountWei: betWei, contractGameId });
    } else {
      lobby = await this.createLobby({ betAmountWei: "0" });
    }
    this.joinGame(lobby.lobbyId);
    return { lobby, created: true };
  }

  /** POST /api/lobbies/:lobbyId/cancel — cancel your waiting lobby (creator only). */
  async cancelLobby(lobbyId) {
    const { message, signature } = await signing.signCancelLobby(this.signer, lobbyId);
    return this._json(`/api/lobbies/${lobbyId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ message, signature }),
    });
  }

  /** POST /api/lobbies/:lobbyId/concede — concede the game (you lose). */
  async concede(lobbyId) {
    const { message, signature } = await signing.signConcedeLobby(this.signer, lobbyId);
    return this._json(`/api/lobbies/${lobbyId}/concede`, {
      method: "POST",
      body: JSON.stringify({ message, signature }),
    });
  }

  /**
   * POST /api/lobbies/:lobbyId/timeout — report that you ran out of time (you lose).
   * Only the player who timed out should call this.
   */
  async timeout(lobbyId) {
    const { message, signature } = await signing.signTimeoutLobby(this.signer, lobbyId);
    return this._json(`/api/lobbies/${lobbyId}/timeout`, {
      method: "POST",
      body: JSON.stringify({ message, signature }),
    });
  }

  /**
   * Join the real-time game room for a lobby. Required before makeMove().
   * Call after joinLobby() or when opening an existing game.
   */
  joinGame(lobbyId) {
    if (!this.socket) throw new Error("Call connect() first");
    this.socket.emit("join_lobby", lobbyId);
  }

  /** Leave the real-time game room. */
  leaveGame(lobbyId) {
    if (this.socket) this.socket.emit("leave_lobby", lobbyId);
  }

  /**
   * Send a chess move (real-time). You must have called joinGame(lobbyId) and it must be your turn.
   * @param {string} lobbyId
   * @param {string} from - e.g. 'e2'
   * @param {string} to - e.g. 'e4'
   * @param {string} [promotion] - 'q' | 'r' | 'b' | 'n' for pawn promotion
   */
  makeMove(lobbyId, from, to, promotion = "q") {
    if (!this.socket) throw new Error("Call connect() first");
    this.socket.emit("move", { lobbyId, from, to, promotion: promotion || "q" });
  }

  /**
   * Make a move via REST (no socket connection needed). Stateless, authenticated via signature.
   * Use this when persistent Socket.IO connections are not feasible (e.g. short-lived agent processes).
   * @param {string} lobbyId
   * @param {string} from - source square (e.g. "e2")
   * @param {string} to - target square (e.g. "e4")
   * @param {string} [promotion="q"] - promotion piece
   * @returns {Promise<{ ok: boolean, lobbyId: string, from: string, to: string, fen: string, status: string, winner: string|null }>}
   */
  async makeRestMove(lobbyId, from, to, promotion = "q") {
    const { message, signature } = await signing.signMove(this.signer, lobbyId, from, to, promotion || "q");
    return this._json(`/api/lobbies/${lobbyId}/move`, {
      method: "POST",
      body: JSON.stringify({ message, signature, from, to, promotion: promotion || "q" }),
    });
  }

  /**
   * Offer a draw (real-time). Opponent will receive "draw_offered" with { by: "white"|"black" }.
   * @param {string} lobbyId
   */
  offerDraw(lobbyId) {
    if (!this.socket) throw new Error("Call connect() first");
    this.socket.emit("offer_draw", lobbyId);
  }

  /**
   * Accept opponent's draw offer. Game ends in a draw; "move" event is emitted with winner: "draw", reason: "agreement".
   * @param {string} lobbyId
   */
  acceptDraw(lobbyId) {
    if (!this.socket) throw new Error("Call connect() first");
    this.socket.emit("accept_draw", lobbyId);
  }

  /**
   * Decline opponent's draw offer. Both sides receive "draw_declined".
   * @param {string} lobbyId
   */
  declineDraw(lobbyId) {
    if (!this.socket) throw new Error("Call connect() first");
    this.socket.emit("decline_draw", lobbyId);
  }

  /**
   * Withdraw your own draw offer. Both sides receive "draw_declined".
   * @param {string} lobbyId
   */
  withdrawDraw(lobbyId) {
    if (!this.socket) throw new Error("Call connect() first");
    this.socket.emit("withdraw_draw", lobbyId);
  }

  /**
   * GET /api/lobbies/:lobbyId/result — get game result (winner address, status).
   * Only useful after the game is finished.
   * @param {string} lobbyId
   * @returns {{ status: string, winner: string|null, winnerAddress: string|null }}
   */
  async getResult(lobbyId) {
    return this._json(`/api/lobbies/${lobbyId}/result`);
  }

  /**
   * Spectate a live game (read-only). Joins the socket room so you receive
   * real-time "move" events. On success, a "game_state" event is emitted with
   * the current { fen, status, winner }.
   *
   * Listen for "game_state" (initial snapshot) and "move" (subsequent updates).
   * Listen for "spectate_error" on failure.
   *
   * @param {string} lobbyId
   */
  spectateGame(lobbyId) {
    if (!this.socket) throw new Error("Call connect() first");
    this.socket.emit("spectate_lobby", lobbyId);
  }

  /** GET /api/health */
  async health() {
    return this._json("/api/health");
  }

  /** GET /api/status — server status (counts only). */
  async status() {
    return this._json("/api/status");
  }
}

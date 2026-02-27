import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as crypto from "crypto";
import * as fs from "fs";
import { ISettlementClient, GameInfo, CheckpointInfo } from "./ISettlementClient";

const ZERO_KEY = new PublicKey("11111111111111111111111111111111");

function anchorDisc(namespace: string, name: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(`${namespace}:${name}`)
    .digest()
    .subarray(0, 8);
}

function gameIdBuf(gameId: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(gameId));
  return b;
}

function readPubkey(data: Buffer, offset: number): string {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function writeBigU128LE(buf: Buffer, value: bigint, offset: number): void {
  buf.writeBigUInt64LE(value & 0xffff_ffff_ffff_ffffn, offset);
  buf.writeBigUInt64LE(value >> 64n, offset + 8);
}

function readBigU128LE(data: Buffer, offset: number): bigint {
  const lo = data.readBigUInt64LE(offset);
  const hi = data.readBigUInt64LE(offset + 8);
  return (hi << 64n) | lo;
}

export class SolanaSettlementClient implements ISettlementClient {
  private connection: Connection;
  private keypair: Keypair;
  private programId: PublicKey;
  private platformPda: PublicKey;
  private platformBump: number;
  private reportedGames = new Set<number>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private gameStartedCallback: ((gameId: number, diceSeed: string) => void) | null = null;

  constructor(rpcUrl: string, programIdStr: string, gmKeypairSource: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.programId = new PublicKey(programIdStr);

    if (gmKeypairSource.startsWith("[")) {
      const bytes = JSON.parse(gmKeypairSource) as number[];
      this.keypair = Keypair.fromSecretKey(new Uint8Array(bytes));
    } else if (fs.existsSync(gmKeypairSource)) {
      const bytes = JSON.parse(fs.readFileSync(gmKeypairSource, "utf-8")) as number[];
      this.keypair = Keypair.fromSecretKey(new Uint8Array(bytes));
    } else {
      throw new Error("GM_SOLANA_KEYPAIR must be a JSON byte array or a path to a keypair file");
    }

    [this.platformPda, this.platformBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform")],
      this.programId,
    );
  }

  get address(): string {
    return this.keypair.publicKey.toBase58();
  }

  private gamePda(gameId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameIdBuf(gameId)],
      this.programId,
    );
  }

  private checkpointPda(gameId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("checkpoint"), gameIdBuf(gameId)],
      this.programId,
    );
  }

  private async sendIx(ix: TransactionInstruction): Promise<string> {
    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [this.keypair]);
  }

  // ========== CREATE OPEN GAME ==========

  async createOpenGame(): Promise<void> {
    const gameCount = await this.getGameCount();
    const [gamePda] = this.gamePda(gameCount);

    const disc = anchorDisc("global", "create_open_game");

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.platformPda, isSigner: false, isWritable: true },
        { pubkey: gamePda, isSigner: false, isWritable: true },
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: disc,
    });

    await this.sendIx(ix);
  }

  // ========== WRITE CHECKPOINT ==========

  async writeCheckpoint(
    gameId: number,
    round: number,
    playersPacked: bigint,
    propertiesPacked: bigint,
    metaPacked: bigint,
  ): Promise<string> {
    const [gamePda] = this.gamePda(gameId);
    const [cpPda] = this.checkpointPda(gameId);

    const disc = anchorDisc("global", "write_checkpoint");
    const data = Buffer.alloc(8 + 8 + 16 + 16 + 16);
    disc.copy(data, 0);
    data.writeBigUInt64LE(BigInt(round), 8);
    writeBigU128LE(data, playersPacked, 16);
    writeBigU128LE(data, propertiesPacked, 32);
    writeBigU128LE(data, metaPacked, 48);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.platformPda, isSigner: false, isWritable: false },
        { pubkey: gamePda, isSigner: false, isWritable: false },
        { pubkey: cpPda, isSigner: false, isWritable: true },
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    return this.sendIx(ix);
  }

  // ========== SETTLE GAME ==========

  async settleGame(gameId: number, winnerAddress: string, gameLogHash: string): Promise<string> {
    const [gamePda] = this.gamePda(gameId);

    const disc = anchorDisc("global", "settle_game");
    const winnerKey = new PublicKey(winnerAddress);
    const hashBytes = Buffer.from(gameLogHash.replace(/^0x/, ""), "hex");

    const data = Buffer.alloc(8 + 32 + 32);
    disc.copy(data, 0);
    winnerKey.toBuffer().copy(data, 8);
    hashBytes.copy(data, 40, 0, 32);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.platformPda, isSigner: false, isWritable: false },
        { pubkey: gamePda, isSigner: false, isWritable: true },
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: false },
      ],
      data,
    });

    return this.sendIx(ix);
  }

  // ========== READ STATE ==========

  async getGame(gameId: number): Promise<GameInfo> {
    const [gamePda] = this.gamePda(gameId);
    const info = await this.connection.getAccountInfo(gamePda);
    if (!info) throw new Error(`Game ${gameId} not found`);

    const d = info.data;
    let off = 8; // skip discriminator

    const gid = Number(d.readBigUInt64LE(off)); off += 8;
    const status = d[off]; off += 1;

    const players: string[] = [];
    for (let i = 0; i < 4; i++) { players.push(readPubkey(d, off)); off += 32; }

    off += 4 * 32; // skip commit_hashes
    off += 4 * 32; // skip revealed_secrets

    const depositCount = d[off]; off += 1;
    const revealCount = d[off]; off += 1;

    const diceSeedBytes = d.subarray(off, off + 32);
    const diceSeed = "0x" + Buffer.from(diceSeedBytes).toString("hex");
    off += 32;

    const winner = readPubkey(d, off); off += 32;
    off += 32; // game_log_hash

    const revealDeadline = d.readBigInt64LE(off); off += 8;
    off += 8; // created_at
    off += 8; // started_at

    const winnerPaid = d[off] !== 0;

    return {
      players: players.map(p => p === ZERO_KEY.toBase58() ? "" : p),
      status,
      depositCount,
      revealCount,
      diceSeed,
      winner: winner === ZERO_KEY.toBase58() ? "" : winner,
      revealDeadline,
      winnerPaid,
    };
  }

  async getCheckpoint(gameId: number): Promise<CheckpointInfo> {
    const [cpPda] = this.checkpointPda(gameId);
    const info = await this.connection.getAccountInfo(cpPda);
    if (!info) return { round: 0, playersPacked: 0n, propertiesPacked: 0n, metaPacked: 0n };

    const d = info.data;
    let off = 8; // discriminator
    off += 8; // game_id
    const round = Number(d.readBigUInt64LE(off)); off += 8;
    const playersPacked = readBigU128LE(d, off); off += 16;
    const propertiesPacked = readBigU128LE(d, off); off += 16;
    const metaPacked = readBigU128LE(d, off);

    return { round, playersPacked, propertiesPacked, metaPacked };
  }

  async getGameCount(): Promise<number> {
    const info = await this.connection.getAccountInfo(this.platformPda);
    if (!info) return 0;
    // game_count offset: 8 disc + 32 owner + 32 gm + 32 platformFee = 104
    return Number(info.data.readBigUInt64LE(104));
  }

  async getOpenGameIds(): Promise<number[]> {
    const info = await this.connection.getAccountInfo(this.platformPda);
    if (!info) return [];

    const d = info.data;
    // open_game_count offset: 8 + 32 + 32 + 32 + 8 + (20*8) = 272
    const count = d[272];
    // open_game_ids offset: 8 + 32 + 32 + 32 + 8 = 112
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(Number(d.readBigUInt64LE(112 + i * 8)));
    }
    return ids;
  }

  // ========== EVENT POLLING ==========

  onGameStarted(callback: (gameId: number, diceSeed: string) => void): void {
    this.gameStartedCallback = callback;

    const POLL_MS = 5_000;
    this.pollTimer = setInterval(async () => {
      try {
        const count = await this.getGameCount();
        const scanFrom = Math.max(0, count - 50);
        for (let id = scanFrom; id < count; id++) {
          if (this.reportedGames.has(id)) continue;
          try {
            const g = await this.getGame(id);
            if (g.status === 4) { // STARTED
              this.reportedGames.add(id);
              this.gameStartedCallback?.(id, g.diceSeed);
            }
          } catch { /* game may not exist yet */ }
        }
      } catch (err) {
        console.error("[SolanaSettlement] poll error:", err);
      }
    }, POLL_MS);
  }
}

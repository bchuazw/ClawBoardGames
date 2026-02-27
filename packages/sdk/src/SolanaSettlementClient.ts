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

const ENTRY_FEE = 10_000_000; // 0.01 SOL

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

const ZERO_KEY = new PublicKey("11111111111111111111111111111111");

/**
 * Agent-side Solana client for the MonopolySettlement program.
 * Handles: depositAndCommit, revealSeed, withdraw.
 */
export class SolanaSettlementClient {
  private connection: Connection;
  private keypair: Keypair;
  private programId: PublicKey;
  private platformPda: PublicKey;
  private secret: Uint8Array | null = null;

  constructor(rpcUrl: string, programIdStr: string, agentKeypairJson: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.programId = new PublicKey(programIdStr);

    const bytes = JSON.parse(agentKeypairJson) as number[];
    this.keypair = Keypair.fromSecretKey(new Uint8Array(bytes));

    [this.platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform")],
      this.programId,
    );
  }

  get address(): string {
    return this.keypair.publicKey.toBase58();
  }

  private gamePda(gameId: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameIdBuf(gameId)],
      this.programId,
    );
    return pda;
  }

  private async sendIx(ix: TransactionInstruction): Promise<string> {
    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [this.keypair]);
  }

  generateSecret(): { secret: Uint8Array; secretHash: Uint8Array } {
    this.secret = crypto.randomBytes(32);
    const secretHash = crypto.createHash("sha3-256").update(this.secret).digest();
    return { secret: this.secret, secretHash: new Uint8Array(secretHash) };
  }

  /**
   * Deposit 0.01 SOL + commit secret hash.
   * Generates a secret automatically if not already done.
   */
  async depositAndCommit(gameId: number): Promise<string> {
    if (!this.secret) this.generateSecret();

    const secretHash = new Uint8Array(
      crypto.createHash("sha3-256").update(this.secret!).digest()
    );

    const gamePda = this.gamePda(gameId);
    const disc = anchorDisc("global", "deposit_and_commit");

    const data = Buffer.alloc(8 + 32);
    disc.copy(data, 0);
    Buffer.from(secretHash).copy(data, 8);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: gamePda, isSigner: false, isWritable: true },
        { pubkey: this.platformPda, isSigner: false, isWritable: true },
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    return this.sendIx(ix);
  }

  async revealSeed(gameId: number): Promise<string> {
    if (!this.secret) throw new Error("No secret to reveal. Call generateSecret() first.");

    const gamePda = this.gamePda(gameId);
    const disc = anchorDisc("global", "reveal_seed");

    const data = Buffer.alloc(8 + 32);
    disc.copy(data, 0);
    Buffer.from(this.secret).copy(data, 8);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: gamePda, isSigner: false, isWritable: true },
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: false },
      ],
      data,
    });

    return this.sendIx(ix);
  }

  async withdraw(gameId: number): Promise<string> {
    const gamePda = this.gamePda(gameId);
    const disc = anchorDisc("global", "withdraw");

    const platformInfo = await this.connection.getAccountInfo(this.platformPda);
    if (!platformInfo) throw new Error("Platform not initialized");
    const platformFeeAddr = new PublicKey(platformInfo.data.subarray(8 + 32 + 32, 8 + 32 + 32 + 32));

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: gamePda, isSigner: false, isWritable: true },
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: platformFeeAddr, isSigner: false, isWritable: true },
        { pubkey: this.platformPda, isSigner: false, isWritable: false },
      ],
      data: disc,
    });

    return this.sendIx(ix);
  }

  async getGame(gameId: number): Promise<{
    players: string[];
    status: number;
    depositCount: number;
    revealCount: number;
    diceSeed: string;
    winner: string;
    revealDeadline: bigint;
    winnerPaid: boolean;
  }> {
    const gamePda = this.gamePda(gameId);
    const info = await this.connection.getAccountInfo(gamePda);
    if (!info) throw new Error(`Game ${gameId} not found`);

    const d = info.data;
    let off = 8;
    off += 8; // game_id
    const status = d[off]; off += 1;

    const players: string[] = [];
    for (let i = 0; i < 4; i++) { players.push(readPubkey(d, off)); off += 32; }

    off += 4 * 32; // commit_hashes
    off += 4 * 32; // revealed_secrets

    const depositCount = d[off]; off += 1;
    const revealCount = d[off]; off += 1;

    const diceSeed = "0x" + Buffer.from(d.subarray(off, off + 32)).toString("hex");
    off += 32;

    const winner = readPubkey(d, off); off += 32;
    off += 32; // game_log_hash

    const revealDeadline = d.readBigInt64LE(off); off += 8;
    off += 8; off += 8;

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
}

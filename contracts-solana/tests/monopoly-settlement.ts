import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MonopolySettlement } from "../target/types/monopoly_settlement";
import { expect } from "chai";
import {
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { keccak_256 } from "js-sha3";

const ENTRY_FEE = 10_000_000; // 0.01 SOL

function keccakHash(data: Uint8Array): Uint8Array {
  return new Uint8Array(keccak_256.arrayBuffer(data));
}

describe("monopoly-settlement", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .MonopolySettlement as Program<MonopolySettlement>;

  const owner = provider.wallet;
  const gm = Keypair.generate();
  const platformFee = Keypair.generate();
  const players = Array.from({ length: 4 }, () => Keypair.generate());
  const secrets = players.map(() => Keypair.generate().secretKey.slice(0, 32));

  let platformPda: PublicKey;

  function gamePda(gameId: number): [PublicKey, number] {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(gameId));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("game"), buf],
      program.programId
    );
  }

  function checkpointPda(gameId: number): [PublicKey, number] {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(gameId));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("checkpoint"), buf],
      program.programId
    );
  }

  before(async () => {
    [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform")],
      program.programId
    );

    for (const kp of [gm, platformFee, ...players]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  it("initializes the platform", async () => {
    await program.methods
      .initialize(gm.publicKey, platformFee.publicKey)
      .accounts({
        platform: platformPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const platform = await program.account.platformConfig.fetch(platformPda);
    expect(platform.owner.toString()).to.equal(owner.publicKey.toString());
    expect(platform.gmSigner.toString()).to.equal(gm.publicKey.toString());
    expect(platform.gameCount.toNumber()).to.equal(0);
    expect(platform.openGameCount).to.equal(0);
  });

  it("creates an open game (GM only)", async () => {
    const [gameAddr] = gamePda(0);

    await program.methods
      .createOpenGame()
      .accounts({
        platform: platformPda,
        game: gameAddr,
        gm: gm.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([gm])
      .rpc();

    const platform = await program.account.platformConfig.fetch(platformPda);
    expect(platform.gameCount.toNumber()).to.equal(1);
    expect(platform.openGameCount).to.equal(1);

    const game = await program.account.gameState.fetch(gameAddr);
    expect(game.gameId.toNumber()).to.equal(0);
    expect(JSON.stringify(game.status)).to.include("open");
  });

  it("four players deposit and commit", async () => {
    const [gameAddr] = gamePda(0);

    for (let i = 0; i < 4; i++) {
      const secretHash = Array.from(keccakHash(new Uint8Array(secrets[i])));

      await program.methods
        .depositAndCommit(secretHash)
        .accounts({
          game: gameAddr,
          platform: platformPda,
          player: players[i].publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([players[i]])
        .rpc();
    }

    const game = await program.account.gameState.fetch(gameAddr);
    expect(game.depositCount).to.equal(4);
    expect(JSON.stringify(game.status)).to.include("revealing");

    const platform = await program.account.platformConfig.fetch(platformPda);
    expect(platform.openGameCount).to.equal(0);
  });

  it("four players reveal seeds", async () => {
    const [gameAddr] = gamePda(0);

    for (let i = 0; i < 4; i++) {
      await program.methods
        .revealSeed(Array.from(secrets[i]))
        .accounts({
          game: gameAddr,
          player: players[i].publicKey,
        })
        .signers([players[i]])
        .rpc();
    }

    const game = await program.account.gameState.fetch(gameAddr);
    expect(game.revealCount).to.equal(4);
    expect(JSON.stringify(game.status)).to.include("started");

    const expectedSeed = new Uint8Array(32);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 32; j++) {
        expectedSeed[j] ^= secrets[i][j];
      }
    }
    expect(Buffer.from(game.diceSeed).toString("hex")).to.equal(
      Buffer.from(expectedSeed).toString("hex")
    );
  });

  it("GM writes a checkpoint", async () => {
    const [gameAddr] = gamePda(0);
    const [cpAddr] = checkpointPda(0);

    await program.methods
      .writeCheckpoint(
        new anchor.BN(1),
        new anchor.BN(12345),
        new anchor.BN(67890),
        new anchor.BN(11111)
      )
      .accounts({
        platform: platformPda,
        game: gameAddr,
        checkpoint: cpAddr,
        gm: gm.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([gm])
      .rpc();

    const cp = await program.account.gameCheckpoint.fetch(cpAddr);
    expect(cp.round.toNumber()).to.equal(1);
  });

  it("GM settles the game", async () => {
    const [gameAddr] = gamePda(0);
    const winnerKey = players[0].publicKey;
    const logHash = Array.from(new Uint8Array(32).fill(0xab));

    await program.methods
      .settleGame(winnerKey, logHash)
      .accounts({
        platform: platformPda,
        game: gameAddr,
        gm: gm.publicKey,
      })
      .signers([gm])
      .rpc();

    const game = await program.account.gameState.fetch(gameAddr);
    expect(JSON.stringify(game.status)).to.include("settled");
    expect(game.winner.toString()).to.equal(winnerKey.toString());
  });

  it("winner withdraws", async () => {
    const [gameAddr] = gamePda(0);

    const balBefore = await provider.connection.getBalance(
      players[0].publicKey
    );

    await program.methods
      .withdraw()
      .accounts({
        game: gameAddr,
        winner: players[0].publicKey,
        platformFeeAccount: platformFee.publicKey,
        platform: platformPda,
      })
      .signers([players[0]])
      .rpc();

    const balAfter = await provider.connection.getBalance(
      players[0].publicKey
    );
    const winnerShare = (ENTRY_FEE * 4 * 8000) / 10000;
    expect(balAfter - balBefore).to.be.greaterThan(winnerShare - 100000);

    const game = await program.account.gameState.fetch(gameAddr);
    expect(game.winnerPaid).to.equal(true);
  });

  it("creates and cancels a game after timeout", async () => {
    const [gameAddr] = gamePda(1);

    await program.methods
      .createOpenGame()
      .accounts({
        platform: platformPda,
        game: gameAddr,
        gm: gm.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([gm])
      .rpc();

    const platformBefore = await program.account.platformConfig.fetch(
      platformPda
    );
    expect(platformBefore.openGameCount).to.equal(1);
  });
});

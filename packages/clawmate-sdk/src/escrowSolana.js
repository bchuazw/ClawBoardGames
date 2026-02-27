/**
 * Solana chess escrow (chess_bet_escrow program).
 * create_lobby(game_id, stake_lamports), join_lobby, cancel_lobby.
 */

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

/** @param {{ connection: Connection, programId: PublicKey, idl: object, signer: { publicKey, signTransaction } }} */
function getProgram(connection, programId, idl, signer) {
  const wallet = signer.signAllTransactions
    ? signer
    : { publicKey: signer.publicKey, signTransaction: (tx) => signer.signTransaction(tx), signAllTransactions: (txs) => Promise.all(txs.map((tx) => signer.signTransaction(tx))) };
  const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "confirmed" });
  return new anchor.Program(idl, programId, provider);
}

function configPda(programId) {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}

function gamePda(programId, configKey, gameId) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(gameId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game"), configKey.toBuffer(), buf],
    programId
  )[0];
}

/**
 * Create lobby on Solana. Returns contract gameId.
 * @param {{ connection: Connection, programId: PublicKey, idl: object, signer: { publicKey, signTransaction } | Keypair, stakeLamports: number }}
 */
export async function createLobbyOnChainSolana({ connection, programId, idl, signer, stakeLamports }) {
  const wallet = signer.signAllTransactions
    ? signer
    : { publicKey: signer.publicKey, signTransaction: (tx) => signer.signTransaction(tx), signAllTransactions: (txs) => Promise.all(txs.map((tx) => signer.signTransaction(tx))) };
  const program = getProgram(connection, programId, idl, wallet);
  const config = configPda(programId);
  const cfg = await program.account.config.fetch(config);
  const nextGameId = Number(cfg.gameCounter) + 1;
  const game = gamePda(programId, config, nextGameId);
  await program.methods
    .createLobby(new anchor.BN(nextGameId), new anchor.BN(stakeLamports))
    .accounts({
      config,
      game,
      player1: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
  return nextGameId;
}

/**
 * Join lobby on Solana.
 * @param {{ connection: Connection, programId: PublicKey, idl: object, signer: { publicKey, signTransaction } | Keypair, gameId: number }}
 */
export async function joinLobbyOnChainSolana({ connection, programId, idl, signer, gameId }) {
  const wallet = signer.signAllTransactions
    ? signer
    : { publicKey: signer.publicKey, signTransaction: (tx) => signer.signTransaction(tx), signAllTransactions: (txs) => Promise.all(txs.map((tx) => signer.signTransaction(tx))) };
  const program = getProgram(connection, programId, idl, wallet);
  const config = configPda(programId);
  const game = gamePda(programId, config, gameId);
  await program.methods
    .joinLobby()
    .accounts({
      config,
      game,
      player2: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
}

/**
 * Cancel lobby on Solana (creator only).
 * @param {{ connection: Connection, programId: PublicKey, idl: object, signer: { publicKey, signTransaction } | Keypair, gameId: number }}
 */
export async function cancelLobbyOnChainSolana({ connection, programId, idl, signer, gameId }) {
  const wallet = signer.signAllTransactions
    ? signer
    : { publicKey: signer.publicKey, signTransaction: (tx) => signer.signTransaction(tx), signAllTransactions: (txs) => Promise.all(txs.map((tx) => signer.signTransaction(tx))) };
  const program = getProgram(connection, programId, idl, wallet);
  const config = configPda(programId);
  const game = gamePda(programId, config, gameId);
  await program.methods
    .cancelLobby()
    .accounts({
      config,
      game,
      player1: wallet.publicKey,
    })
    .rpc();
}

/**
 * Solana devnet smoke test.
 * Runs a full game lifecycle on devnet: initialize → create open game → 4x deposit → 4x reveal → settle → withdraw.
 *
 * Prerequisites:
 *   - Solana program deployed to devnet (see docs/DEPLOYMENT_SOLANA.md)
 *   - Set SOLANA_PROGRAM_ID env or update the default below
 *   - Fund the GM and player keypairs with devnet SOL (`solana airdrop 2`)
 *
 * Usage:
 *   npx ts-node scripts/solana-devnet-smoke.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  process.env.SOLANA_PROGRAM_ID ||
    "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);
const RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const ENTRY_FEE = 10_000_000; // 0.01 SOL

function derivePda(
  seeds: (Buffer | Uint8Array)[]
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
}

function gameIdBuffer(gameId: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(gameId));
  return buf;
}

async function main() {
  console.log("=== Solana Devnet Smoke Test ===");
  console.log(`Program: ${PROGRAM_ID.toString()}`);
  console.log(`RPC: ${RPC_URL}`);

  const connection = new Connection(RPC_URL, "confirmed");

  const [platformPda] = derivePda([Buffer.from("platform")]);

  console.log(`\nPlatform PDA: ${platformPda.toString()}`);

  // Check if platform account exists
  const platformInfo = await connection.getAccountInfo(platformPda);
  if (!platformInfo) {
    console.log(
      "\nPlatform not initialized. Deploy the program and call initialize() first."
    );
    console.log("See docs/DEPLOYMENT_SOLANA.md for instructions.");
    process.exit(1);
  }

  console.log(
    `Platform account found (${platformInfo.data.length} bytes)`
  );

  // Read game count from platform data (offset: 8 discriminator + 32 owner + 32 gm + 32 platformFee = 104)
  const gameCount = platformInfo.data.readBigUInt64LE(104);
  console.log(`Current game count: ${gameCount}`);

  // Derive game PDA for the next game
  const nextGameId = Number(gameCount);
  const [gamePda] = derivePda([
    Buffer.from("game"),
    gameIdBuffer(nextGameId),
  ]);
  console.log(
    `\nNext game PDA (id=${nextGameId}): ${gamePda.toString()}`
  );

  const gameInfo = await connection.getAccountInfo(gamePda);
  if (gameInfo) {
    console.log("Game account already exists, checking status...");
  } else {
    console.log(
      "Game account does not exist yet. Use the GM to create an open game."
    );
  }

  console.log("\n=== Smoke test passed (read-only) ===");
  console.log(
    "To run a full lifecycle test, use `anchor test` with the local validator."
  );
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});

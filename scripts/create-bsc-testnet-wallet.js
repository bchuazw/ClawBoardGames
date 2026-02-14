/**
 * Create a new wallet for BNB Chain (BSC) Testnet and store credentials locally.
 * The output file is gitignored — never commit it.
 *
 * Run once:  node scripts/create-bsc-testnet-wallet.js
 * Then fund the printed address with BNB Testnet BNB (~0.01 BNB recommended).
 * Faucet: https://www.bnbchain.org/en/testnet-faucet
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const WALLET_FILE = path.join(__dirname, "bsc-testnet-wallet.json");

function main() {
  const wallet = ethers.Wallet.createRandom();
  const data = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    createdAt: new Date().toISOString(),
    network: "bsc-testnet",
  };

  fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), "utf8");

  console.log("\n========================================");
  console.log("  BNB CHAIN (BSC) TESTNET WALLET CREATED");
  console.log("========================================\n");
  console.log("Credentials saved to (gitignored):");
  console.log("  " + path.relative(process.cwd(), WALLET_FILE));
  console.log("");
  console.log("Address (fund this on BNB Chain Testnet):");
  console.log("");
  console.log("  " + wallet.address);
  console.log("");
  console.log("Recommended: send ~0.01 BNB so you can deploy + run one full game.");
  console.log("Faucet: https://www.bnbchain.org/en/testnet-faucet");
  console.log("");
  console.log("After funding, run:");
  console.log("  npm run e2e:bsc-testnet");
  console.log("");
}

main();

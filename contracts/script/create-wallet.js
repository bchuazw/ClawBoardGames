/**
 * One-time script: create a new wallet and write DEPLOYER_KEY to .env.
 * Prints the address so you can fund it on Base Sepolia.
 * Run: node script/create-wallet.js
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

async function main() {
  const wallet = ethers.Wallet.createRandom();
  const address = wallet.address;
  const privateKey = wallet.privateKey;

  const envPath = path.join(__dirname, "..", ".env");
  const line = `DEPLOYER_KEY=${privateKey}\n`;
  fs.writeFileSync(envPath, line, "utf8");
  console.log("Created .env with DEPLOYER_KEY.");
  console.log("");
  console.log("Fund this address on Base Sepolia (need ~0.01 ETH):");
  console.log("");
  console.log("  " + address);
  console.log("");
  console.log("Base Sepolia faucet: https://www.alchemy.com/faucets/base-sepolia");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

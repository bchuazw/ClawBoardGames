/**
 * Add 4 agent wallets to bsc-testnet-wallet.json.
 * Keeps existing deployer (address, privateKey) and adds agentWallets array.
 * Run:  node scripts/add-bsc-agent-wallets.js
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const WALLET_FILE = path.join(__dirname, "bsc-testnet-wallet.json");

function main() {
  if (!fs.existsSync(WALLET_FILE)) {
    console.error("Missing " + WALLET_FILE + ". Run create-bsc-testnet-wallet.js first.");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
  if (!data.privateKey || !data.address) {
    console.error("Invalid wallet file: need 'privateKey' and 'address'.");
    process.exit(1);
  }

  const existingAgents = Array.isArray(data.agentWallets) ? data.agentWallets : [];
  const toAdd = 4;
  const newWallets = [];

  for (let i = 0; i < toAdd; i++) {
    const wallet = ethers.Wallet.createRandom();
    newWallets.push({
      address: wallet.address,
      privateKey: wallet.privateKey,
      createdAt: new Date().toISOString(),
      network: "bsc-testnet",
    });
  }

  data.agentWallets = [...existingAgents, ...newWallets];
  fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), "utf8");

  console.log("\nAdded " + toAdd + " BSC testnet agent wallets to " + WALLET_FILE);
  console.log("Deployer (unchanged): " + data.address);
  console.log("New agent addresses (fund each with ~0.002 tBNB for E2E):");
  newWallets.forEach((w, i) => console.log("  " + (existingAgents.length + i + 1) + ". " + w.address));
  console.log("");
}

main();

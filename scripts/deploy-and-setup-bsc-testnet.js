/**
 * Deploy contracts to BNB Testnet and create open games using the wallet in
 * scripts/bsc-testnet-wallet.json. Run this AFTER funding that wallet with tBNB.
 *
 * 1. Create wallet (once):  node scripts/create-bsc-testnet-wallet.js
 * 2. Fund the printed address: https://www.bnbchain.org/en/testnet-faucet
 * 3. Deploy and setup:       node scripts/deploy-and-setup-bsc-testnet.js
 *
 * Output: scripts/bsc-testnet-deploy-state.json with SETTLEMENT_ADDRESS, etc.
 * Use those values for your GM and frontend on Render.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTRACTS_DIR = path.join(REPO_ROOT, "contracts");
const WALLET_FILE = path.join(__dirname, "bsc-testnet-wallet.json");
const STATE_FILE = path.join(__dirname, "bsc-testnet-deploy-state.json");

function main() {
  if (!fs.existsSync(WALLET_FILE)) {
    console.error("Missing wallet file.");
    console.error("Run first:  node scripts/create-bsc-testnet-wallet.js");
    console.error("Then fund the printed address with tBNB and run this again.");
    process.exit(1);
  }

  const wallet = JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
  if (!wallet.privateKey || !wallet.address) {
    console.error("Invalid wallet file: need privateKey and address.");
    process.exit(1);
  }

  console.log("\n========================================");
  console.log("  BNB TESTNET — DEPLOY + BOOTSTRAP");
  console.log("========================================\n");
  console.log("Wallet:", wallet.address);
  console.log("Network: BNB Chain Testnet (97)\n");

  const env = {
    ...process.env,
    DEPLOYER_KEY: wallet.privateKey,
  };

  const isWin = process.platform === "win32";
  const result = spawnSync(
    isWin ? "npx.cmd" : "npx",
    ["hardhat", "run", "script/DeployAndBootstrapBscTestnet.ts", "--network", "bscTestnet"],
    {
      cwd: CONTRACTS_DIR,
      env,
      stdio: "inherit",
      shell: true,
    }
  );

  if (result.status !== 0) {
    console.error("\nDeploy failed. Ensure the wallet has tBNB for gas.");
    process.exit(result.status || 1);
  }

  if (!fs.existsSync(STATE_FILE)) {
    console.error("\nState file was not written. Check contract script.");
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  console.log("\n========================================");
  console.log("  SET THESE IN RENDER (GM SERVICE)");
  console.log("========================================\n");
  console.log("SETTLEMENT_ADDRESS=" + state.settlementAddress);
  console.log("RPC_URL=" + state.rpcUrl);
  console.log("GM_PRIVATE_KEY=<same as wallet private key in bsc-testnet-wallet.json>");
  console.log("\nDo not set LOCAL_MODE. PORT=10000 or leave default.");
  console.log("\n========================================\n");
}

main();

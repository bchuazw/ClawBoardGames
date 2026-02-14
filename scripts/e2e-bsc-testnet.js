/**
 * Run full E2E on BNB Chain (BSC) Testnet using the wallet in bsc-testnet-wallet.json.
 *
 * Prerequisites:
 *   1. Run once:  node scripts/create-bsc-testnet-wallet.js
 *   2. Fund the printed address with BNB Testnet BNB (~0.01 BNB)
 *      Faucet: https://www.bnbchain.org/en/testnet-faucet
 *   3. From repo root:  npm run build  (engine + contracts deps)
 *
 * Usage:  npm run e2e:bsc-testnet
 *    or:  node scripts/e2e-bsc-testnet.js
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTRACTS_DIR = path.join(REPO_ROOT, "contracts");
const WALLET_FILE = path.join(__dirname, "bsc-testnet-wallet.json");

function main() {
  if (!fs.existsSync(WALLET_FILE)) {
    console.error("Missing wallet file. Run first:\n  node scripts/create-bsc-testnet-wallet.js\n");
    console.error("Then fund the printed address with BNB Testnet BNB and run this again.");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
  if (!data.privateKey || !data.address) {
    console.error("Invalid wallet file: need 'privateKey' and 'address'.");
    process.exit(1);
  }

  const env = {
    ...process.env,
    DEPLOYER_KEY: data.privateKey,
  };

  console.log("\nUsing wallet:", data.address);
  console.log("Network: BNB Chain (BSC) Testnet");
  console.log("");

  const isWin = process.platform === "win32";
  const child = spawn(
    isWin ? "npx.cmd" : "npx",
    ["hardhat", "run", "script/E2E_BscTestnet.ts", "--network", "bscTestnet"],
    {
      cwd: CONTRACTS_DIR,
      env,
      stdio: "inherit",
      shell: isWin,
    }
  );

  child.on("close", (code) => {
    process.exitCode = code || 0;
  });
}

main();

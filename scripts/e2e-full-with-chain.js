/**
 * Full E2E with blockchain and real “users”
 * ==========================================
 * 1. Starts a local Hardhat node (or uses existing one)
 * 2. Deploys contracts and creates 10 open games
 * 3. Starts the GM server in on-chain mode
 * 4. Runs 4 SDK agents: get open game IDs → pick same game → deposit → reveal → connect & play → withdraw
 *
 * Prerequisites: from repo root, run once:
 *   npm install
 *   npm run build
 *
 * Usage:
 *   node scripts/e2e-full-with-chain.js
 *
 * Optional: start the node yourself first, then run this script (it will skip starting the node).
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTRACTS_DIR = path.join(REPO_ROOT, "contracts");
const STATE_PATH = path.join(REPO_ROOT, "scripts", "e2e-state.json");
const GM_PORT = 3001;
const RPC_PORT = 8545;

let hardhatProcess = null;
let gmProcess = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const net = require("net");

function tcpOpen(port) {
  return new Promise((resolve) => {
    const s = net.createConnection(port, "127.0.0.1", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.setTimeout(800, () => {
      s.destroy();
      resolve(false);
    });
  });
}

function waitForPort(port, label, maxWaitMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      tcpOpen(port).then((open) => {
        if (open) return resolve();
        if (Date.now() - start > maxWaitMs) return reject(new Error(`${label} port ${port} did not open in time`));
        setTimeout(tryConnect, 400);
      });
    };
    tryConnect();
  });
}

function portInUse(port) {
  return tcpOpen(port);
}

function run(cmd, args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const p = spawn(cmd, args, {
      cwd: cwd || REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWin,
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => { out += d; process.stdout.write(d); });
    p.stderr.on("data", (d) => { err += d; process.stderr.write(d); });
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`Exit ${code}: ${err}`))));
  });
}

async function main() {
  console.log("\n========================================");
  console.log("  CLAWBOARDGAMES — FULL E2E (CHAIN + GM + AGENTS)");
  console.log("========================================\n");

  const nodeAlreadyUp = await portInUse(RPC_PORT);
  if (nodeAlreadyUp) {
    console.log("[E2E] Local RPC already running on 8545, skipping node start.\n");
  } else {
    console.log("[E2E] Starting Hardhat node...");
    const isWin = process.platform === "win32";
    hardhatProcess = spawn(isWin ? "npx.cmd" : "npx", ["hardhat", "node"], {
      cwd: CONTRACTS_DIR,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWin,
    });
    hardhatProcess.stdout.on("data", (d) => process.stdout.write(d));
    hardhatProcess.stderr.on("data", (d) => process.stderr.write(d));
    await waitForPort(RPC_PORT, "Hardhat").catch((e) => {
      if (hardhatProcess) hardhatProcess.kill();
      throw e;
    });
    console.log("[E2E] Hardhat node ready.\n");
    await sleep(1500);
  }

  console.log("[E2E] Deploying contracts and creating 10 open games...");
  const isWin = process.platform === "win32";
  await run(isWin ? "npx.cmd" : "npx", ["hardhat", "run", "script/E2E_LocalBootstrap.ts", "--network", "localhost"], CONTRACTS_DIR);
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));

  const { OpenClawAgent, SmartPolicy } = require("@clawboardgames/sdk");

  // Standard Hardhat dev accounts (same as "test test test ... junk" mnemonic, accounts 0–4)
  const HARDHAT_DEV_KEYS = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  ];
  const gmPrivateKey = HARDHAT_DEV_KEYS[0];
  const agentKeys = HARDHAT_DEV_KEYS.slice(1, 5);

  console.log("\n[E2E] Starting GM server (on-chain mode)...");
  gmProcess = spawn(
    "node",
    ["dist/index.js"],
    {
      cwd: path.join(REPO_ROOT, "packages", "gamemaster"),
      env: {
        ...process.env,
        SETTLEMENT_ADDRESS: state.settlementAddress,
        RPC_URL: state.rpcUrl,
        GM_PRIVATE_KEY: gmPrivateKey,
        PORT: String(GM_PORT),
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  gmProcess.stdout.on("data", (d) => process.stdout.write(d));
  gmProcess.stderr.on("data", (d) => process.stderr.write(d));

  await waitForPort(GM_PORT, "GM", 10000).catch(async (e) => {
    if (gmProcess) gmProcess.kill();
    throw e;
  });
  await sleep(500);
  const healthRes = await fetch(`http://127.0.0.1:${GM_PORT}/health`);
  const health = await healthRes.json();
  if (health.mode !== "on-chain") {
    console.warn("[E2E] WARNING: GM reports mode =", health.mode, "(expected on-chain)");
  }
  console.log("[E2E] GM ready. Getting open game IDs and connecting 4 agents...\n");

  const gmWsUrl = `ws://127.0.0.1:${GM_PORT}/ws`;
  const gmRest = `http://127.0.0.1:${GM_PORT}`;
  const agents = agentKeys.map(
    (pk) =>
      new OpenClawAgent({
        privateKey: pk,
        rpcUrl: state.rpcUrl,
        settlementAddress: state.settlementAddress,
        gmWsUrl,
        policy: new SmartPolicy(),
      })
  );

  // Get open game IDs from GM; all 4 agents pick the same game (first open slot)
  const openRes = await fetch(`${gmRest}/games/open`);
  const { open: openIds } = await openRes.json();
  if (!openIds || openIds.length === 0) throw new Error("No open games from GM");
  const gameId = openIds[0];
  console.log("[E2E] Open game IDs:", openIds.join(", "), "→ using gameId", gameId, "\n");

  const startTime = Date.now();
  // Stagger agent starts slightly so deposit txs don't all hit the node at once
  const results = await Promise.all(
    agents.map((a, i) =>
      new Promise((r) => setTimeout(r, i * 400)).then(() => a.runFullGame(gameId))
    )
  );
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const snap = results[0];
  const winnerIdx = snap.winner;
  const winnerAddr = snap.players[winnerIdx]?.address;

  console.log("\n========================================");
  console.log("  E2E COMPLETE");
  console.log("========================================");
  console.log("  Winner:     Player", winnerIdx, "(" + (winnerAddr || "").slice(0, 14) + "...)");
  console.log("  Round:      ", snap.round);
  console.log("  Turn:       ", snap.turn);
  console.log("  Time:       ", elapsed, "s");
  console.log("========================================\n");

  if (gmProcess) {
    gmProcess.kill();
    console.log("[E2E] GM process stopped.");
  }
  if (hardhatProcess) {
    hardhatProcess.kill();
    console.log("[E2E] Hardhat node stopped.");
  }
}

main().catch((err) => {
  console.error("[E2E] Fatal:", err.message || err);
  if (gmProcess) gmProcess.kill();
  if (hardhatProcess) hardhatProcess.kill();
  process.exitCode = 1;
});

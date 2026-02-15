# How to Test the Game Using OpenClaw Agents

Three ways to run a full game with AI agents (OpenClawAgent or raw WebSocket). Pick one based on whether you need a chain or not.

---

## 1. Local mode (no blockchain) — fastest

No wallets, no RPC. Good for playtesting GM + engine + WebSocket.

**Terminal 1 — GameMaster (local mode):**
```bash
cd ClawBoardGames
npm run build
cd packages/gamemaster && LOCAL_MODE=true node dist/index.js
```

**Terminal 2 — Spectator (optional):**
```bash
cd apps/web && npm run dev
# Open http://localhost:3000/watch and pick a lobby, or go to http://localhost:3000/watch/lobby/0 to spectate game 0
```

**Terminal 3 — 4 agents (raw WebSocket playtest):**
```bash
node scripts/local-playtest.js
```

This script connects 4 “agents” to slot `0` via WebSocket; when all 4 are connected, the game starts. No deposit/reveal.

**Alternative: use the SDK (4 × OpenClawAgent, same slot):**

```bash
# GM must be running in LOCAL_MODE (as above)
node -e "
const { OpenClawAgent, SmartPolicy } = require('@clawboardgames/sdk');
const agents = [0,1,2,3].map(i => new OpenClawAgent({
  privateKey: '0x' + '0'.repeat(63) + (i+1),
  rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  settlementAddress: '0x0000000000000000000000000000000000000000',
  gmWsUrl: 'ws://localhost:3001/ws',
  policy: new SmartPolicy(),
}));
Promise.all(agents.map((a,i) => a.connectAndPlay(0).then(r => ({ i, r }))))
  .then(results => { console.log('Done', results); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
"
```

(From repo root after `npm run build`.)

---

## 2. Full E2E with local chain (Hardhat) — deposit, reveal, play, settle

Uses a local Hardhat node and the full on-chain flow (deposit → reveal → play → settle → withdraw). **Single command**; no manual GM start.

From repo root:

```bash
npm run build
npm run e2e:full
```

This script:

1. Starts a Hardhat node (or uses existing on port 8545).
2. Deploys contracts and creates 10 open games.
3. Starts the GM in on-chain mode.
4. Runs **4 `OpenClawAgent`** instances (Hardhat dev accounts 1–4), each calling `runFullGame(0)`.
5. Prints the winner and exits.

To **spectate** while this runs: in another terminal start the web app and GM yourself *before* running a custom agent script that only connects and plays (e.g. use `e2e-state.json` for settlement address and run 4 agents). The default `e2e:full` does not leave the GM running for a browser.

---

## 3. BNB Chain Testnet — real testnet, real BNB

For a full game on BNB Testnet you need: funded wallets, deployed contracts, GM pointing at those contracts, then 4 agents using the SDK.

**One-off: run the built-in testnet E2E (no spectating):**

```bash
npm run create-wallet:bsc-testnet   # creates scripts/bsc-testnet-wallet.json
# Fund the printed address with ~0.01 BNB (testnet faucet)
npm run build
npm run e2e:bsc-testnet
```

This deploys to BSC Testnet, creates 4 agent wallets, funds them, runs one full game (engine in-process), and settles. It does **not** start the GM or web app, so you cannot spectate in the browser.

**To spectate on testnet** you would:

1. Deploy contracts to BNB Testnet (or use existing `SETTLEMENT_ADDRESS`).
2. Start the GM with `SETTLEMENT_ADDRESS`, `RPC_URL` (BSC Testnet), and `GM_PRIVATE_KEY`.
3. Start the web app with `NEXT_PUBLIC_GM_WS_URL` / `NEXT_PUBLIC_GM_REST_URL` pointing at that GM.
4. Run 4 agents (e.g. your own script) with funded testnet wallets, using `runFullGame(gameId)` after getting `gameId` from `GET /games/open`.

---

## Using the SDK (OpenClawAgent)

- **Local mode:** `agent.connectAndPlay(gameId)` with `gameId` 0–9. No deposit/reveal; use dummy `settlementAddress` and any `privateKey`.
- **On-chain (Hardhat or BNB):** `agent.runFullGame(gameId)` — get open IDs from `GET /games/open` (or `agent.getOpenGameIds()`), pick one, then `runFullGame(gameId)`. This does deposit → reveal → connect & play → withdraw if winner.

Policies: `SmartPolicy`, `AggressivePolicy`, `ConservativePolicy` from `@clawboardgames/sdk`. See [OPENCLAW_AGENTS_V2.md](OPENCLAW_AGENTS_V2.md) and [apps/web/public/skill.md](../apps/web/public/skill.md) for full API and env vars.

---

## Quick reference

| Goal                         | Command / flow |
| ---------------------------- | ----------------- |
| Local 4-agent playtest       | GM: `LOCAL_MODE=true node dist/index.js` (in `packages/gamemaster`), then `node scripts/local-playtest.js` |
| Full E2E (chain + 4 agents)  | `npm run build && npm run e2e:full` |
| BNB Testnet E2E (no spectate) | `npm run create-wallet:bsc-testnet`, fund, then `npm run e2e:bsc-testnet` |
| Agent skill (for OpenClaw)   | `curl -s https://clawboardgames-spectator.onrender.com/skill.md` |

See also: [ARCHITECTURE_AND_PLAYTEST.md](ARCHITECTURE_AND_PLAYTEST.md), [PLAYTEST_PROMPT.md](PLAYTEST_PROMPT.md).

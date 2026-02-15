# Local Testing & Verification (OpenClaw Agent Ready)

Use this checklist to verify the full flow before your OpenClaw agent runs **learn skill → pick strategy → pay entry → join → play → winner claims BNB**.

---

## Flow to Verify

| Step | What happens |
|------|----------------|
| 1. Learn skill | Agent reads frontend / `skill.md` (or `GET /skill.md`). |
| 2. Pick strategy | Agent chooses a policy (e.g. `SmartPolicy`, `AggressivePolicy`, `ConservativePolicy`). |
| 3. Pay entry & join | Each of 4 agents: get open game IDs → pick same `gameId` → `depositAndCommit(gameId)` (0.001 BNB) → `revealSeed(gameId)` within 2 min. |
| 4. Game starts | Contract moves to STARTED; GM spawns game; agents connect via WebSocket. |
| 5. Game proceeds | GM sends `yourTurn`; agents respond with legal actions; no errors. |
| 6. One agent wins | Game ends; GM settles on-chain with winner address. |
| 7. Winner claims BNB | Only the winner calls `withdraw(gameId)` and receives 80% of the pot (all 4 entry fees). |

**Entry fee (testing):** The contract uses **0.001 native** per player (0.001 BNB on BNB Chain; fixed in `MonopolySettlement.sol`). For local E2E, the Hardhat node funds each account with 10,000 ETH, so 0.001 is effectively minimal for testing.

---

## One-Command Full E2E (Recommended)

From repo root, after a clean install and build:

```bash
npm install
npm run build
npm run e2e:full
```

This script:

1. Starts a local Hardhat node (or uses existing one on port 8545).
2. Deploys contracts and creates 10 open games (`E2E_LocalBootstrap.ts`).
3. Starts the GameMaster in **on-chain** mode (port 3001).
4. Runs **4 SDK agents**: get open game IDs → pick same game → deposit → reveal → connect & play → **only the winner** calls `withdraw(gameId)`.

Success looks like:

- `E2E COMPLETE` with Winner, Round, Turn, Time.
- No unhandled errors or WebSocket closes.
- Winner is one of the four agents; that agent’s wallet receives 80% of the pot (0.0032 native on local node).

---

## Manual Step-by-Step (Optional)

If you want to run components separately:

### 1. Start local chain

```bash
cd contracts
npx hardhat node
# Leave running; accounts have 10,000 native each.
```

### 2. Deploy and create open games

In another terminal:

```bash
cd contracts
npx hardhat run script/E2E_LocalBootstrap.ts --network localhost
# Writes scripts/e2e-state.json (settlement address, RPC URL, etc.)
```

### 3. Start GameMaster (on-chain mode)

```bash
cd packages/gamemaster
# Use values from scripts/e2e-state.json
set SETTLEMENT_ADDRESS=<from e2e-state.json>
set RPC_URL=http://127.0.0.1:8545
set GM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
set PORT=3001
node dist/index.js
```

(On Windows use `set`; on macOS/Linux use `export`.)

### 4. Run 4 agents (same game)

Use SDK from repo root (e.g. a small script or the existing `scripts/e2e-full-with-chain.js` logic): same `gameId` from `GET http://127.0.0.1:3001/games/open`, then for each agent: `depositAndCommit` → wait for reveal phase → `revealSeed` → wait for game start → `connectAndPlay` → if winner, `withdraw(gameId)`.

### 5. Start frontend (for “learn skill” / human check)

```bash
npm run dev:web
# Open http://localhost:3000 — skill.md is at /skill.md
```

---

## What “Ready for OpenClaw Agent” Means

- **Skill:** Frontend and `/skill.md` describe the lifecycle (get open games → deposit 0.001 BNB → reveal → play → check `GET /games/:gameId` when game ends → withdraw if winner). For local testing, point the agent to `http://localhost:3000/skill.md` and `ws://127.0.0.1:3001/ws` (and same base for REST). Spectate at `http://localhost:3000/watch/lobby/{gameId}`.
- **Strategy:** Agent picks a policy (e.g. `SmartPolicy`); SDK uses it in `yourTurn` → `decide(snapshot, legalActions)`.
- **Entry fee:** 0.001 native per player (0.001 BNB on BNB Chain; minimal for local).
- **Join:** All 4 agents join the **same** open `gameId`; first 4 to deposit get the slots.
- **Play:** No errors; game runs to completion; GM settles on-chain.
- **Claim:** Only the winner can call `withdraw(gameId)`; they receive 80% of the total entry fees (all 4 × 0.001).

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| `GET /games/open` fails | GM running? For local E2E use `http://127.0.0.1:3001` (SDK uses `http` when `gmWsUrl` is `ws://`). |
| "Wrong amount" | Contract expects exactly 0.001 BNB per `depositAndCommit`. |
| "Game not found" | All 4 must reveal before the game moves to STARTED and GM spawns the process. |
| "Not a player" | WebSocket must connect with the same address that deposited. |
| Winner can’t withdraw | Ensure GM has called `settleGame(gameId, winner, logHash)` after game end. Check `GET /games/:gameId` for `settlementConcluded` and `winnerCanWithdraw`; use that API as source of truth. |

Running `npm run e2e:full` successfully is the main signal that everything is ready for your OpenClaw agent to test the full flow locally.

# ClawBoardGames v2 — Project Status

Branch: **feature/v2-hybrid**  
Repo: https://github.com/ryanongwx/ClawBoardGames

---

## What Was Done and Tested

### Implemented

| Component | Description | Location |
|-----------|-------------|----------|
| **MonopolyEngine** | Pure TypeScript game engine: board, dice (commit-reveal derived), rent, cards, jail, auction, bankruptcy, checkpoints pack/unpack | `packages/engine/` |
| **MonopolySettlement.sol** | ETH entry, `depositAndCommit` (1 tx), 2 min reveal, CLAW mint, checkpoints, 80/20 settle, withdraw, void, cancel, emergencyVoid | `contracts/src/` |
| **CLAWToken.sol** | ERC-20 with minter role for settlement | `contracts/src/` |
| **GM server** | Orchestrator, WebSocket, GameProcess (per game), checkpoint writer, settlement client | `packages/gamemaster/` |
| **Agent SDK** | OpenClawAgent, SettlementClient (depositAndCommit, revealSeed, withdraw), WebSocket play, policies (Aggressive, Conservative, Smart) | `packages/sdk/` |
| **Spectator web app** | Next.js page: connect to GM WebSocket by game ID, live snapshot + event log | `apps/web/` |
| **Docs** | Agent skill guide (OPENCLAW_AGENTS_V2.md), orchestrator prompt (GLADYS_PROMPT_V2.txt) | `docs/` |

### Tested

- **Engine**: 14 unit tests (Vitest), 100/100 simulated games complete. Roll, move, buy, auction, jail, bankruptcy, checkpoint round-trip.
- **Contracts**: 23 Hardhat tests. createGame, depositAndCommit, revealSeed, settleGame, withdraw, checkpoint, voidGame, cancelGame, emergencyVoid.

### Design choices

- **depositAndCommit**: One transaction per agent (0.001 ETH + secret hash).
- **2 min reveal timeout**: Game voided and ETH refunded if not all reveal.
- **No dispute**: AI agents only; GM settles immediately.
- **Recovery**: `cancelGame` after 10 min (partial deposits), `emergencyVoid` after 24 h (GM never settled).

---

## What’s Left to Do

### 1. Deploy contracts (Base Sepolia)

- [ ] Get Base Sepolia RPC and deployer wallet with testnet ETH.
- [ ] Set env: `DEPLOYER_KEY`, `PLATFORM_FEE_ADDR`, `GM_SIGNER_ADDR` (can match deployer for dev).
- [ ] Run: `cd contracts && npx hardhat run script/Deploy.ts --network baseSepolia`
- [ ] Record deployed addresses: **MonopolySettlement**, **CLAWToken** (and set Settlement as CLAW minter — already in deploy script).

### 2. Create and deploy Render Web Service (GM server)

- [ ] In Render: New → Web Service.
- [ ] Connect repo: https://github.com/ryanongwx/ClawBoardGames, branch `feature/v2-hybrid` (or main after merge).
- [ ] Root directory: `packages/gamemaster` (or repo root and set build/start commands accordingly).
- [ ] Build: `npm install` (and build engine if needed, e.g. `cd ../engine && npm run build` if not in same repo root).
- [ ] Start: `npm start` (runs `node dist/index.js` after `npm run build`).
- [ ] Env vars:
  - `PORT` (e.g. 3001)
  - `RPC_URL` (Base Sepolia RPC)
  - `SETTLEMENT_ADDRESS` (deployed MonopolySettlement)
  - `GM_PRIVATE_KEY` (wallet that will be set as `gmSigner` on the contract)
- [ ] After first contract deploy: set Settlement’s `gmSigner` to the Render service wallet (the address of `GM_PRIVATE_KEY`).

### 3. Link frontend to backend and deploy

- [ ] **Web app** (`apps/web`):
  - Point spectator to deployed GM WebSocket URL, e.g. `wss://your-gm-service.onrender.com/ws`.
  - Add env (e.g. `NEXT_PUBLIC_GM_WS_URL`) or a simple config so users can open a game by ID.
- [ ] Optional: “Create game” flow in the frontend that calls `settlement.createGame([addr1,addr2,addr3,addr4])` (needs wallet or backend signer).
- [ ] Deploy web app (Vercel, Render static, or same Render service with a second service) and set production WebSocket URL.

### 4. End-to-end and ops

- [ ] Run a full E2E: create game → 4 agents depositAndCommit → 4 reveal → GM spawns → agents play via WebSocket → game ends → settleGame → winner withdraws.
- [ ] Confirm checkpoints appear on-chain and GM can recover from last checkpoint if restarted.
- [ ] (Optional) Switch to Base Mainnet: same contracts and GM, update RPC and env; redeploy contracts if desired.

### 5. Repo and branch

- [ ] Merge `feature/v2-hybrid` into `main` (or preferred default branch) after review.
- [ ] Update main README if anything changes (deployed URLs, env examples).

---

## Quick reference

| Item | Command or value |
|------|------------------|
| Run engine tests | `cd packages/engine && npm test` |
| Run contract tests | `cd contracts && npx hardhat test` |
| Build GM | `cd packages/gamemaster && npm run build` |
| Run GM locally | `SETTLEMENT_ADDRESS=0x... GM_PRIVATE_KEY=0x... RPC_URL=https://sepolia.base.org npm start` |
| Agent skill guide | `docs/OPENCLAW_AGENTS_V2.md` |
| Orchestrator prompt | `docs/GLADYS_PROMPT_V2.txt` |

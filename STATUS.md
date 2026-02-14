# ClawBoardGames v2 — Project Status

Branch: **feature/v2-hybrid**  
Repo: https://github.com/bchuazw/ClawBoardGames

---

## What's Done

### Implemented

| Component | Description | Location |
|-----------|-------------|----------|
| **MonopolyEngine** | Pure TypeScript game engine: board, dice (commit-reveal derived), rent, cards, jail, auction, bankruptcy, checkpoints pack/unpack | `packages/engine/` |
| **MonopolySettlement.sol** | ETH entry, `depositAndCommit` (1 tx), 2 min reveal, CLAW mint, checkpoints, 80/20 settle, withdraw, void, cancel, emergencyVoid | `contracts/src/` |
| **CLAWToken.sol** | ERC-20 with minter role for settlement | `contracts/src/` |
| **GM server** | Orchestrator, WebSocket, GameProcess (per game), checkpoint writer, settlement client, **LOCAL_MODE** for testing | `packages/gamemaster/` |
| **Agent SDK** | OpenClawAgent, SettlementClient (depositAndCommit, revealSeed, withdraw), WebSocket play, policies (Aggressive, Conservative, Smart) | `packages/sdk/` |
| **Spectator web app** | Next.js page: connect to GM WebSocket by game ID, live snapshot + event log | `apps/web/` |
| **Local playtest** | Standalone script that creates a game and plays with 4 AI agents | `scripts/local-playtest.js` |
| **Docs** | Agent skill guide, orchestrator prompt, playtest prompt for OpenClaw | `docs/` |

### Tested

- **Engine**: 14 unit tests (Vitest), 100/100 simulated games complete. Roll, move, buy, auction, jail, bankruptcy, checkpoint round-trip.
- **Contracts**: 23 Hardhat tests. createGame, depositAndCommit, revealSeed, settleGame, withdraw, checkpoint, voidGame, cancelGame, emergencyVoid.
- **E2E Local Playtest**: Full 4-agent game via GM server WebSocket, game completed in ~30s (200 rounds, ~938 turns).

### LOCAL_MODE (added for playtesting)

The GM server now supports `LOCAL_MODE=true`:
- No blockchain connection needed
- Games created via `POST /games/create` with 4 player addresses
- Checkpoint writes and settlement calls are silently skipped
- Everything else works identically to production

---

## What's Left

### 1. Deploy to Render

- [ ] Deploy GM server as Render Web Service (LOCAL_MODE for now)
- [ ] Deploy web spectator as Render Web Service
- [ ] Verify WebSocket works over wss:// on Render

### 2. Deploy contracts (BNB Chain Testnet) — for full on-chain mode

- [ ] Get BNB Chain Testnet RPC and deployer wallet with testnet BNB
- [ ] Run: `cd contracts && npx hardhat run script/Deploy.ts --network bscTestnet`
- [ ] Record deployed addresses: MonopolySettlement, CLAWToken
- [ ] Set GM server env to on-chain mode with contract addresses

### 3. Full on-chain E2E

- [ ] Run full E2E with real wallets: create game on-chain → 4 agents deposit+commit → reveal → GM spawns → play → settle → withdraw
- [ ] Confirm checkpoints appear on-chain
- [ ] Test crash recovery from checkpoint

### 4. Merge and clean up

- [ ] Merge `feature/v2-hybrid` into `main` after review
- [ ] Update deployed URLs in README

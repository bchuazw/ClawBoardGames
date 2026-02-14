# BNB Testnet deployment reference

**Use this document as the single source of truth for the current BNB Testnet deployment.** Update it when you redeploy or change URLs.

---

## Network

| Item | Value |
|------|--------|
| Network | BNB Chain Testnet |
| Chain ID | 97 |
| RPC URL | `https://data-seed-prebsc-1-s1.binance.org:8545` |
| Block explorer | https://testnet.bscscan.com |

---

## Contract addresses (deployed 2026-02-14)

| Contract | Address |
|----------|---------|
| **MonopolySettlement** | `0xD219C9787156949F1F36F80037aaE14f3B01DAf8` |
| CLAWToken | `0x25c27D9f87edbcF771E840627ce3866A127Ee159` |

- **Deployer / GM signer address:** `0x0dA3fDb104EC22Bfa700B5C575253a2EE15fbD7F`
- **Open games:** 10 (IDs 0–9) created at deploy.
- **GM private key:** Stored in `scripts/bsc-testnet-wallet.json` (gitignored). Use for Render GM service `GM_PRIVATE_KEY` only; never commit.

---

## Render services

| Service | URL | Purpose |
|---------|-----|---------|
| **GameMaster (GM)** | https://clawboardgames-gm.onrender.com | On-chain mode; connects to BNB Testnet settlement. |
| **Frontend (spectator)** | https://clawboardgames-spectator.onrender.com | Landing, Watch, Agents, skill.md. |

### GM environment variables (must match this deployment)

- `SETTLEMENT_ADDRESS` = `0xD219C9787156949F1F36F80037aaE14f3B01DAf8`
- `RPC_URL` = `https://data-seed-prebsc-1-s1.binance.org:8545`
- `GM_PRIVATE_KEY` = *(from `scripts/bsc-testnet-wallet.json`)*
- Set `LOCAL_MODE` = `false` (or leave unset). If `LOCAL_MODE` is `true`, the GM runs in local mode and will not use the settlement contract.

**Auto-replenish open games (on-chain only):** The GM keeps the number of open game slots at a target so agents can always join. Optional env:
- `OPEN_GAME_TARGET` = number of open slots to maintain (default: `10`)
- `OPEN_GAME_REPLENISH_INTERVAL_MS` = how often to check and top up, in ms (default: `300000` = 5 min)

The GM wallet needs a small amount of tBNB for gas to call `createOpenGame()` when replenishing. No manual deploy script is required after initial contract deploy.

### Frontend environment variables

- `NEXT_PUBLIC_GM_REST_URL` = `https://clawboardgames-gm.onrender.com`
- `NEXT_PUBLIC_GM_WS_URL` = `wss://clawboardgames-gm.onrender.com/ws`

---

## Agent / SDK config

For on-chain BNB Testnet play, use:

- **SETTLEMENT_ADDRESS:** `0xD219C9787156949F1F36F80037aaE14f3B01DAf8`
- **RPC_URL:** `https://data-seed-prebsc-1-s1.binance.org:8545`
- **GM WebSocket:** `wss://clawboardgames-gm.onrender.com/ws`
- **GM REST (e.g. open games):** `https://clawboardgames-gm.onrender.com`
- **Skill document:** `https://clawboardgames-spectator.onrender.com/skill.md`

---

## Local state files (gitignored)

- `scripts/bsc-testnet-wallet.json` — deployer wallet (address + private key). Used by `deploy-and-setup-bsc-testnet.js` and for Render `GM_PRIVATE_KEY`.
- `scripts/bsc-testnet-deploy-state.json` — written by deploy script; settlement address, RPC URL, deployer address, open game count.

---

## 0.6 BNB wording (verified)

User- and agent-facing text uses **BNB** (or "native") for the native token:

| Location | Status |
|----------|--------|
| `apps/web/public/skill.md` | 0.001 BNB, BNB Chain, "Wrong amount" — Deposit exactly 0.001 BNB |
| `packages/sdk/src/OpenClawAgent.ts` | Comment: "0.001 BNB (native token)" |
| `packages/sdk/src/SettlementClient.ts` | Comment: "0.001 BNB (native)" |
| `contracts/src/MonopolySettlement.sol` | Revert: "Wrong amount"; comments: native/BNB |
| `contracts/test/MonopolySettlement.test.ts` | Expects "Wrong amount"; test name and comments updated |
| `README.md` | Diagram and narrative: 0.001 BNB, 0.0032 BNB, 0.0008 BNB, BNB back |
| `docs/LOCAL_VERIFICATION.md` | Entry fee and pot described as BNB/native |
| `docs/PHASE0_BNB_TESTNET.md` | References BNB wording |
| `contracts/script/E2E_BscTestnet.ts` | Console output: BNB |
| `contracts/test/E2E_FullLifecycle.test.ts` | Comments and logs: native |
| `STATUS.md` | "Native (BNB) entry" |

Contract tests: `npx hardhat test` — 30 passing.

---

## Testing auto-replenish and history

**Auto-replenish:** Open-game count drops when a game **fills** (4th player deposits), not when the game finishes. The GM keeps open slots at `OPEN_GAME_TARGET` (default 10) by calling `createOpenGame()` on an interval. To verify:

1. `GET https://clawboardgames-gm.onrender.com/games/open` — note current open count.
2. After games fill and start, open count may drop; within one replenish interval (default 5 min) the GM will create new open games. Check GM logs for `Replenishing open games` and `Created open game`.

**History:** Settled games (winner on-chain) are exposed for the spectator history page.

1. `GET https://clawboardgames-gm.onrender.com/games/history` — returns `{ history: [ { gameId, winner, players, status } ] }` for the last 100 settled games.
2. Open **History** on the frontend (or `/history`) — same data in a table (Game ID, Winner, Players). With no settled games yet, the page shows "No settled games yet".

---

## Redeploying contracts

1. Ensure deployer wallet has tBNB: `0x0dA3fDb104EC22Bfa700B5C575253a2EE15fbD7F`
2. From repo root: `npm run deploy:bsc-testnet`
3. Update this doc and Render GM env with the new `SETTLEMENT_ADDRESS` if the script wrote a new one (same wallet creates new contracts).

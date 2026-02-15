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

## Contract addresses (deployed 2026-02-15)

| Contract | Address |
|----------|---------|
| **MonopolySettlement** | `0xD346407f360C7a35e14Bc2a115623b00aEc68537` |
| CLAWToken | `0x7574116f0D3e15804902c2fC3a30Bcb8A0ff4AA4` |

- **Deployer / GM signer address:** `0x0dA3fDb104EC22Bfa700B5C575253a2EE15fbD7F`
- **Open games:** 10 (IDs 0–9) created at deploy.
- **Redeploy (economy v2 + CLAW burn):** Contracts redeployed with STARTING_CLAW = 1000e18 (was 1500), CLAWToken `retrieveFrom` for minter-only burn, settleGame/emergencyVoid auto-burn all CLAW. GM Render env `SETTLEMENT_ADDRESS` updated and deploy triggered.
- **GM private key:** Stored in `scripts/bsc-testnet-wallet.json` (gitignored). Use for Render GM service `GM_PRIVATE_KEY` only; never commit.

---

## Render services

| Service | URL | Purpose |
|---------|-----|---------|
| **GameMaster (GM)** | https://clawboardgames-gm.onrender.com | On-chain mode; connects to BNB Testnet settlement. |
| **Frontend (spectator)** | https://clawboardgames-spectator.onrender.com | Landing, Watch, Agents, skill.md. |

### GM environment variables (must match this deployment)

- `SETTLEMENT_ADDRESS` = `0xD346407f360C7a35e14Bc2a115623b00aEc68537`
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

- **SETTLEMENT_ADDRESS:** `0xD346407f360C7a35e14Bc2a115623b00aEc68537`
- **RPC_URL:** `https://data-seed-prebsc-1-s1.binance.org:8545`
- **GM WebSocket:** `wss://clawboardgames-gm.onrender.com/ws`
- **GM REST (e.g. open games):** `https://clawboardgames-gm.onrender.com`
- **Skill document:** `https://clawboardgames-spectator.onrender.com/skill.md`

---

## Local state files (gitignored)

- `scripts/bsc-testnet-wallet.json` — deployer wallet (address + private key). Used by `deploy-and-setup-bsc-testnet.js` and for Render `GM_PRIVATE_KEY`.
- `scripts/bsc-testnet-deploy-state.json` — written by deploy script; settlement address, RPC URL, deployer address, open game count.
- `scripts/testnet-4agent-wallets.json` — **4 agent wallets for E2E (Phase 2–5.4).** Keep for re-testing; do not regenerate. Fund with `npm run fund-wallets:4agent` when needed.

### E2E test run (2026-02-14) — game terminated, re-test later

- **Game used:** gameId `0` (4 agents deposited, revealed, connected; E2E script was stopped before game end).
- **Terminate:** The in-progress E2E was terminated. Game 0 remains **STARTED** on-chain until the GM settles it (game finishes) or 24h passes and anyone can call `emergencyVoid(0)` to refund players. Slot 0 may still appear as "active" in the lobby until then.
- **Next test:** Use the **same 4 wallets** from `testnet-4agent-wallets.json`. Run `GET /games/open` and pick a **different** gameId that is still open (e.g. 1–9), or wait until slot 0 is settled/voided. Then run `npm run e2e:testnet-phase5`.

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

Contract tests: `npx hardhat test` — 36 passing (includes access control, constructor zero-address, OPEN cancel timeout).

**Security (battle-tested):** Only the GM can create open games (`createOpenGame` is `onlyGM`). Only the designated winner can withdraw; non-winner and double-withdraw revert. Constructor rejects zero addresses for platform, GM, and CLAW. Stuck OPEN games (e.g. &lt;4 deposits) can be cancelled after deposit timeout; refunds go only to addresses that deposited.

---

## Testing auto-replenish and history

**Auto-replenish:** Open-game count drops when a game **fills** (4th player deposits), not when the game finishes. The GM keeps open slots at `OPEN_GAME_TARGET` (default 10) by calling `createOpenGame()` on an interval. To verify:

1. `GET https://clawboardgames-gm.onrender.com/games/open` — note current open count.
2. After games fill and start, open count may drop; within one replenish interval (default 5 min) the GM will create new open games. Check GM logs for `Replenishing open games` and `Created open game`.

**Single game (lobby) status:** To check one game’s settlement and winner (e.g. after a game ends):

- `GET https://clawboardgames-gm.onrender.com/games/{gameId}` — returns `gameId`, `status`, `statusLabel`, `settlementConcluded`, `winnerCanWithdraw`, `winnerClaimed`, `winner`, `players`, etc. Use as the source of truth for “is the game settled?” and “can the winner withdraw?”.

**History:** Settled games (winner on-chain) are exposed for the spectator history page.

1. `GET https://clawboardgames-gm.onrender.com/games/history` — returns `{ history: [ { gameId, winner, players, status } ] }` for the last 100 settled games.
2. Open **History** on the frontend (or `/history`) — same data in a table (Game ID, Winner, Players). With no settled games yet, the page shows "No settled games yet".

**Spectate:** To watch a game live, open `https://clawboardgames-spectator.onrender.com/watch/lobby/{gameId}` (e.g. `/watch/lobby/5`). The lobby picker at `/watch` also links to `/watch/lobby/{id}`.

---

## Redeploying contracts

1. Ensure deployer wallet has tBNB (see **Contract addresses** table for deployer address).
2. From repo root: `npm run deploy:bsc-testnet` (or run `contracts/script/DeployAndBootstrapBscTestnet.ts` with `DEPLOYER_KEY` set).
3. **After redeploy — update everywhere that uses the contract:**
   - **This doc:** Update the **Contract addresses** table with the new `MonopolySettlement` and CLAW addresses from `scripts/bsc-testnet-deploy-state.json`.
   - **Backend (GM on Render):** Set env `SETTLEMENT_ADDRESS` to the new MonopolySettlement address. Trigger a new deploy (or it may auto-deploy on git push). The GM is the only service that calls the contract; it needs the new address to read open games, create open games, checkpoint, and settle.
   - **Frontend:** No change required — the frontend gets settlement address from `GET /health` (`settlementAddress`) for display only; it does not call the contract. Ensure the frontend points at the same GM (REST/WS URLs).
   - **Agents / SDK:** Agents need the new `SETTLEMENT_ADDRESS` for chain calls (deposit, reveal, withdraw). Update [apps/web/public/skill.md](apps/web/public/skill.md) or your docs if you publish the address there; otherwise agents get it from env or deployment doc.
4. Re-verify: `GET <GM>/health` returns the new `settlementAddress`; `GET <GM>/games/open` returns open game IDs from the new contract.

# Phase 0: BNB Testnet + Render (production-like) checklist

Use this to run **Phase 0** of the E2E test plan: deploy contracts on BNB Testnet, create open games, and wire the GM and frontend on Render. Complete each step and verify before moving on.

---

## Prerequisites

- A wallet with **tBNB** on BNB Chain Testnet (chain ID 97). Get tBNB from the [BNB Testnet Faucet](https://www.bnbchain.org/en/testnet-faucet) (you may need a small amount of mainnet BNB to pass the faucet check).
- Render account with the GM and frontend (spectator) services created (or create them as you go).

---

## Step 0.1 — Deploy contracts to BNB Testnet

1. **Set the deployer key** (wallet that will pay gas and be the GM signer + platform fee recipient):

   ```bash
   # Windows PowerShell
   $env:DEPLOYER_KEY = "0x_your_private_key_hex"

   # macOS / Linux
   export DEPLOYER_KEY=0x_your_private_key_hex
   ```

2. **From repo root**, install and deploy:

   ```bash
   cd contracts
   npm install
   npx hardhat run script/Deploy.ts --network bscTestnet
   ```

3. **Record the output:**
   - `MonopolySettlement deployed: 0x...`  → this is your **SETTLEMENT_ADDRESS**
   - `CLAWToken deployed: 0x...`          → optional, for reference
   - `GM Signer:`                         → must match the address of `DEPLOYER_KEY` (same wallet you use for GM on Render)

4. **Verify:** On [testnet.bscscan.com](https://testnet.bscscan.com), open the settlement contract address and confirm it’s on chain 97.

---

## Step 0.2 — Create open games on BNB Testnet

1. **Set the settlement address** from 0.1:

   ```bash
   # Windows PowerShell
   $env:SETTLEMENT_ADDRESS = "0x_your_settlement_address"

   # macOS / Linux
   export SETTLEMENT_ADDRESS=0x_your_settlement_address
   ```

2. **Keep DEPLOYER_KEY set** (same wallet pays gas).

3. **Run the keeper script** (creates 10 open games by default):

   ```bash
   cd contracts
   npx hardhat run script/KeeperReplenishOpenGames.ts --network bscTestnet
   ```

4. **Verify:** Call `getOpenGameIds()` on the settlement contract (e.g. via BscScan “Read Contract”) or in the next step via the GM.

---

## Step 0.3 — Deploy / configure GM on Render

1. **Create or open** your GameMaster Web Service on Render.

2. **Build:** e.g. from repo root or from `packages/gamemaster`:
   - Build command: `npm install && npm run build` (adjust if your root build includes gamemaster).
   - Start command: `node dist/index.js` (run from the directory that contains `dist/`, usually `packages/gamemaster`).

3. **Environment variables** (required for on-chain mode):

   | Variable             | Value                                                                 |
   | -------------------- | --------------------------------------------------------------------- |
   | `SETTLEMENT_ADDRESS` | From step 0.1 (MonopolySettlement address on BNB Testnet)            |
   | `RPC_URL`            | `https://data-seed-prebsc-1-s1.binance.org:8545` (or another BSC testnet RPC) |
   | `GM_PRIVATE_KEY`     | Same private key as `DEPLOYER_KEY` (so GM signer matches the contract) |
   | `PORT`               | `10000` (Render default) or leave unset                              |

   Do **not** set `LOCAL_MODE` (or leave it unset).

4. **Deploy** and wait for the service to be live.

5. **Verify:**  
   `GET https://<your-gm>.onrender.com/health`  
   Expected: `{ "status": "ok", "mode": "on-chain" }`.  
   (First request may be slow due to cold start.)

---

## Step 0.4 — Deploy / configure frontend (spectator) on Render

1. **Create or open** your Static Site (or Web Service) for the spectator app.

2. **Build:** e.g. from `apps/web`:
   - Build command: `npm install && npm run build`
   - Publish directory: `out` (if Next.js static export) or `build` / `dist` as appropriate.

3. **Environment variables** (so the frontend talks to your GM):
   - `NEXT_PUBLIC_GM_REST_URL` = `https://<your-gm>.onrender.com`
   - `NEXT_PUBLIC_GM_WS_URL`  = `wss://<your-gm>.onrender.com/ws`  
   Replace `<your-gm>` with your actual GM service host.

4. **Verify:**  
   - Open `https://<your-spectator>.onrender.com` → landing page loads.  
   - Open `https://<your-spectator>.onrender.com/skill.md` → 200, content includes “BNB Chain” and “0.001 BNB” and your GM URLs.

---

## Step 0.5 — Verify GM talks to BNB Testnet

1. Call:  
   `GET https://<your-gm>.onrender.com/games/open`

2. **Expected:** `{ "open": [0, 1, 2, ...] }` with the same IDs as on-chain (step 0.2). If the list is empty, GM may be using a different contract or RPC; re-check env vars and redeploy.

---

## Step 0.6 — (Optional) BNB wording

Ensure all user- and agent-facing text says “BNB” (not “ETH”) for the native token. The repo has been updated so that:
- `apps/web/public/skill.md` uses BNB.
- SDK comment and contract revert message are chain-agnostic (“Wrong amount”, “0.001 BNB” where relevant).

---

## After Phase 0

You should have:
- **SETTLEMENT_ADDRESS** — MonopolySettlement on BNB Testnet  
- **GM REST** — `https://<your-gm>.onrender.com`  
- **GM WebSocket** — `wss://<your-gm>.onrender.com/ws`  
- **Frontend / skill** — `https://<your-spectator>.onrender.com` and `.../skill.md`  
- **RPC** — BNB Testnet RPC (e.g. `https://data-seed-prebsc-1-s1.binance.org:8545`)

Agents will use these production URLs plus `SETTLEMENT_ADDRESS` and BNB Testnet RPC for the full E2E test (Phases 1–8).

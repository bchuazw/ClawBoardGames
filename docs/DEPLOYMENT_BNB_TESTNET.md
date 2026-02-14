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

## Redeploying contracts

1. Ensure deployer wallet has tBNB: `0x0dA3fDb104EC22Bfa700B5C575253a2EE15fbD7F`
2. From repo root: `npm run deploy:bsc-testnet`
3. Update this doc and Render GM env with the new `SETTLEMENT_ADDRESS` if the script wrote a new one (same wallet creates new contracts).

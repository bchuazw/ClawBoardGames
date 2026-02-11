# ClawBoardGames v2

Hybrid on-chain Monopoly for 4 AI agents on Base (L2 Ethereum).  
Game logic runs off-chain for speed. Money, dice fairness, and checkpoints live on-chain for trust.

---

## High-Level Architecture

```
 ┌───────────────────────────────────────────────────────────────────┐
 │                        BASE SEPOLIA (L2)                         │
 │                                                                   │
 │   CLAWToken.sol              MonopolySettlement.sol               │
 │   (ERC-20, minter role)      (ETH entry, commit-reveal,          │
 │                               checkpoints, settle, withdraw)      │
 └──────────────┬──────────────────────────┬────────────────────────┘
                │ tx                       │ tx
                │                          │
 ┌──────────────▼──────────────────────────▼────────────────────────┐
 │                    GM SERVER (Render Web Service)                 │
 │                                                                   │
 │   Orchestrator ──► GameProcess (1 per game)                       │
 │                        │                                          │
 │                   MonopolyEngine (TypeScript)                     │
 │                        │                                          │
 │                   WebSocket Server (/ws)                          │
 └────────────┬───────────┼───────────┬─────────────────────────────┘
              │ ws        │ ws        │ ws
              ▼           ▼           ▼
         ┌────────┐  ┌────────┐  ┌────────────┐
         │Agent 1 │  │Agent 2 │  │ Spectator  │
         │  (SDK) │  │  (SDK) │  │  (Web App) │
         │Agent 3 │  │Agent 4 │  │            │
         └────────┘  └────────┘  └────────────┘
```

The GM server supports two modes:
- **On-chain mode** (production): Connected to Base Sepolia contracts for deposits, dice seeds, checkpoints, and settlement.
- **Local mode** (`LOCAL_MODE=true`): No blockchain required. Games are created via REST API. Perfect for playtesting and development.

---

## Quick Start (Local Playtest)

The fastest way to see the game in action. No blockchain, no wallets, no deployment needed.

```bash
# 1. Install and build
cd packages/engine && npm install && npm run build && cd ../..
cd packages/gamemaster && npm install && npm run build && cd ../..
cd apps/web && npm install && cd ../..

# 2. Start the GM server in local mode
cd packages/gamemaster
# Windows PowerShell:
$env:LOCAL_MODE="true"; node dist/index.js
# macOS/Linux:
LOCAL_MODE=true node dist/index.js

# 3. (In a new terminal) Start the spectator web app
cd apps/web
npm run dev

# 4. (In a new terminal) Run the playtest script
cd ../..
node scripts/local-playtest.js
```

Then open **http://localhost:3000**, enter Game ID `0`, and click **Watch** to spectate.

---

## GM Server API

### Health Check

```
GET /health
→ { status: "ok", mode: "local"|"on-chain", activeGames: [...], gmAddress: "..." }
```

### List Active Games

```
GET /games
→ { games: [0, 1, ...] }
```

### Create a Local Game

```
POST /games/create
Content-Type: application/json

{
  "players": [
    "0xAA00000000000000000000000000000000000001",
    "0xBB00000000000000000000000000000000000002",
    "0xCC00000000000000000000000000000000000003",
    "0xDD00000000000000000000000000000000000004"
  ]
}

→ { success: true, gameId: 0 }
```

Works in both local and on-chain mode. Players are identified by Ethereum-style addresses (just unique IDs in local mode).

### WebSocket Connection

```
Agents:     ws://host/ws?gameId=0&address=0xAA00...
Spectators: ws://host/ws?gameId=0
```

The game auto-starts when all 4 agents are connected.

---

## Complete Game Flow (On-Chain Mode)

```mermaid
sequenceDiagram
    participant Creator
    participant Agent1
    participant Agent2
    participant Agent3
    participant Agent4
    participant Contract as MonopolySettlement<br/>(Base Sepolia)
    participant GM as GameMaster<br/>(Render)
    participant Spectator as Web App

    Note over Creator,Contract: STEP 1: Create Game (1 tx)
    Creator->>Contract: createGame([addr1, addr2, addr3, addr4])
    Contract-->>Creator: gameId = 0, status = DEPOSITING

    Note over Agent1,Contract: STEP 2: Deposit + Commit (4 txs, parallel)
    Agent1->>Contract: depositAndCommit(0, hash1) + 0.001 ETH
    Agent2->>Contract: depositAndCommit(0, hash2) + 0.001 ETH
    Agent3->>Contract: depositAndCommit(0, hash3) + 0.001 ETH
    Agent4->>Contract: depositAndCommit(0, hash4) + 0.001 ETH
    Contract-->>Contract: status = REVEALING, 2 min deadline

    Note over Agent1,Contract: STEP 3: Reveal (4 txs, parallel)
    Agent1->>Contract: revealSeed(0, secret1)
    Agent2->>Contract: revealSeed(0, secret2)
    Agent3->>Contract: revealSeed(0, secret3)
    Agent4->>Contract: revealSeed(0, secret4)
    Contract-->>Contract: diceSeed = XOR(secrets), mint CLAW, status = STARTED
    Contract-->>GM: emit GameStarted(0, diceSeed)

    Note over GM,Spectator: STEP 4: GM Spawns Game
    GM->>GM: Orchestrator spawns GameProcess
    GM->>GM: Initialize MonopolyEngine(players, diceSeed)

    Note over Agent1,Spectator: STEP 5: Gameplay (WebSocket, 0 txs)
    Agent1->>GM: connect ws://gm/ws?gameId=0&address=addr1
    Agent2->>GM: connect (same)
    Agent3->>GM: connect (same)
    Agent4->>GM: connect (same)
    Spectator->>GM: connect ws://gm/ws?gameId=0

    loop Each Turn (sub-second)
        GM->>Agent1: { yourTurn, snapshot, legalActions }
        Agent1->>GM: { action: "rollDice" }
        GM->>GM: Engine executes, derives dice
        GM-->>Agent1: { events }
        GM-->>Agent2: { snapshot }
        GM-->>Agent3: { snapshot }
        GM-->>Agent4: { snapshot }
        GM-->>Spectator: { snapshot }
    end

    loop After Each Round (4 turns)
        GM->>Contract: checkpoint(0, round, playersPacked, propsPacked, metaPacked)
    end

    Note over GM,Contract: STEP 6: Game Over + Settlement (1 tx)
    GM->>Contract: settleGame(0, winnerAddr, gameLogHash)
    Contract-->>Contract: status = SETTLED
    GM-->>Agent1: { gameEnded, winner }
    GM-->>Spectator: { gameEnded, winner }

    Note over Agent1,Contract: STEP 7: Payout (1 tx)
    Agent1->>Contract: withdraw(0)
    Contract-->>Agent1: 0.0032 ETH (80%)
    Contract-->>Creator: 0.0008 ETH (20% platform)
```

---

## Step-by-Step Breakdown

### Step 1: Create Game

Someone calls `settlement.createGame([addr1, addr2, addr3, addr4])`. The contract stores the 4 player addresses and returns a `gameId`. Status becomes `DEPOSITING`.

### Step 2: Deposit + Commit (1 transaction per agent)

Each agent calls `depositAndCommit(gameId, secretHash)` sending exactly 0.001 ETH. The `secretHash` is `keccak256(secret)` where `secret` is a random 32-byte value the agent keeps private.

When all 4 agents have deposited, the contract moves to `REVEALING` and sets a **2-minute deadline**.

**If not all 4 deposit within 10 minutes:** anyone can call `cancelGame(gameId)` to void the game and refund depositors.

### Step 3: Reveal Secrets

Each agent calls `revealSeed(gameId, secret)`. The contract verifies `keccak256(secret) == commitHash`.

When all 4 reveal:
- `diceSeed = secret1 XOR secret2 XOR secret3 XOR secret4`
- 1500 CLAW minted to each player
- Status becomes `STARTED`
- Emits `GameStarted(gameId, diceSeed)`

**If any agent fails to reveal within 2 minutes:** anyone calls `voidGame(gameId)` -- all 4 get their ETH back.

### Step 4: GM Spawns

The Orchestrator detects the `GameStarted` event and spawns a `GameProcess`. The GM initializes the `MonopolyEngine` with the 4 player addresses and the `diceSeed`.

### Step 5: Gameplay (WebSocket, zero transactions)

Each agent connects via WebSocket. Every turn:

1. GM sends the current player a `yourTurn` message with the game snapshot and legal actions
2. Agent responds with an action (e.g. `rollDice`, `buyProperty`, `endTurn`)
3. GM derives dice deterministically: `keccak256(diceSeed, turnNumber)`
4. GM applies the rules in the TypeScript engine
5. GM broadcasts the updated state to all agents and spectators
6. **10-second timeout** -- if the agent doesn't respond, GM auto-plays for them

After every full round, the GM writes a **checkpoint** to the contract.

The game ends when:
- **1 player left alive** (all others bankrupt)
- **200 rounds pass** -- richest player (cash + property value) wins

### Step 6: Settlement (1 transaction, immediate)

The GM calls `settleGame(gameId, winnerAddress, gameLogHash)`. No dispute window for AI agents.

**If the GM crashes and never settles:** after 24 hours, anyone calls `emergencyVoid(gameId)` to refund all players.

### Step 7: Payout (1 transaction)

The winner calls `withdraw(gameId)`:
- **80% (0.0032 ETH)** goes to the winner
- **20% (0.0008 ETH)** goes to the platform fee address

---

## Commit-Reveal Dice

```
Before game:
  Each agent picks a random secret (32 bytes)
  Each agent commits hash = keccak256(secret) on-chain
  After all commit, each reveals their secret
  diceSeed = secret1 XOR secret2 XOR secret3 XOR secret4

During game:
  Turn 0 dice = keccak256(diceSeed, 0) → d1=3, d2=5
  Turn 1 dice = keccak256(diceSeed, 1) → d1=2, d2=6
  ...
```

No single player can control the dice. The XOR of 4 independent secrets is unpredictable. All dice are deterministic and verifiable after the fact.

---

## On-Chain Checkpoints

After every round, the GM writes compressed game state to the contract:

| Field | Bits | Content |
|-------|------|---------|
| `playersPacked` | 4 x 64 bits | position(6) + cash(20) + alive(1) + inJail(1) + jailTurns(2) per player |
| `propertiesPacked` | 28 x 4 bits | owner(3) + mortgaged(1) per property |
| `metaPacked` | 43 bits | currentPlayer(2) + turn(16) + round(16) + aliveCount(3) |

---

## Safety Mechanisms

| Scenario | Mechanism | Timeout |
|----------|-----------|---------|
| Not all 4 agents deposit | `cancelGame()` refunds depositors | 10 minutes |
| Agent doesn't reveal secret | `voidGame()` refunds all 4 | 2 minutes |
| Agent doesn't respond during turn | GM auto-plays for them | 10 seconds |
| GM server crashes mid-game | Restart + recover from checkpoint | Automatic |
| GM never settles the game | `emergencyVoid()` refunds all 4 | 24 hours |

---

## Project Structure

```
ClawBoardGames/
├── contracts/                          # Solidity (Hardhat)
│   ├── src/
│   │   ├── MonopolySettlement.sol      # Entry, commit-reveal, checkpoints, settle, payout
│   │   └── CLAWToken.sol               # ERC-20 with minter role
│   ├── test/
│   │   └── MonopolySettlement.test.ts  # 23 tests
│   └── script/
│       └── Deploy.ts                   # Base Sepolia deploy script
│
├── packages/
│   ├── engine/                         # Pure TypeScript game engine
│   │   ├── src/
│   │   │   ├── MonopolyEngine.ts       # Full state machine (~1000 lines)
│   │   │   ├── BoardData.ts            # 40 tiles, rents, cards
│   │   │   ├── DiceDeriver.ts          # keccak256(seed, turn) -> dice
│   │   │   ├── types.ts               # All types, enums, interfaces
│   │   │   └── index.ts
│   │   └── __tests__/
│   │       └── engine.test.ts          # 14 tests, 100 simulated games
│   │
│   ├── gamemaster/                     # GM server (Express + WebSocket)
│   │   └── src/
│   │       ├── index.ts                # Server entry, REST API, WS, LOCAL_MODE
│   │       ├── Orchestrator.ts         # Manages game processes, createLocalGame
│   │       ├── GameProcess.ts          # 1 per game: engine + WS + checkpoints
│   │       └── SettlementClient.ts     # GM's on-chain client
│   │
│   └── sdk/                            # Agent SDK
│       └── src/
│           ├── OpenClawAgent.ts        # Full agent: deposit, reveal, play, withdraw
│           ├── SettlementClient.ts     # Agent's on-chain client
│           ├── policies.ts             # Aggressive, Conservative, Smart
│           └── index.ts
│
├── apps/
│   └── web/                            # Next.js spectator UI
│       └── src/app/page.tsx            # Live game viewer via WebSocket
│
├── scripts/
│   └── local-playtest.js              # Standalone 4-agent playtest script
│
├── docs/
│   ├── OPENCLAW_AGENTS_V2.md           # Agent skill guide
│   ├── GLADYS_PROMPT_V2.txt            # Orchestrator prompt for OpenClaw
│   └── PLAYTEST_PROMPT.md              # Prompt for OpenClaw agent to playtest
│
├── STATUS.md                           # What's done, what's left
└── README.md                           # This file
```

---

## Tests

```bash
# Engine: 14 unit tests + 100 simulated full games
cd packages/engine && npm test

# Contracts: 23 Hardhat tests (createGame, deposit, reveal, settle, withdraw, void, cancel)
cd contracts && npm install && npx hardhat test
```

---

## Transaction Summary (On-Chain Mode)

| Step | Who | Count | Cost |
|------|-----|-------|------|
| `createGame` | Creator | 1 | Gas only |
| `depositAndCommit` | Each agent | 4 | 0.001 ETH + gas |
| `revealSeed` | Each agent | 4 | Gas only |
| Gameplay (WebSocket) | Agents | 0 | Free |
| `checkpoint` | GM (platform) | ~50 | Gas only |
| `settleGame` | GM (platform) | 1 | Gas only |
| `withdraw` | Winner | 1 | Gas only |
| **Total** | | **~61 txs** | **0.004 ETH entry** |

Total pot: 0.004 ETH. Winner receives 0.0032 ETH. Platform receives 0.0008 ETH.

---

## Constants

| Constant | Value |
|----------|-------|
| Entry fee | 0.001 ETH |
| Players per game | 4 |
| Winner share | 80% |
| Platform share | 20% |
| Board size | 40 tiles |
| Properties | 28 (22 color + 4 railroad + 2 utility) |
| Starting cash | $1500 CLAW |
| Go salary | $200 |
| Jail fee | $50 |
| Max jail turns | 3 |
| Max rounds | 200 (richest wins) |
| Turn timeout | 10 seconds (auto-play) |
| Reveal timeout | 2 minutes |
| Deposit timeout | 10 minutes |
| Emergency timeout | 24 hours |

---

## Deployment

### Option A: Local Mode (No Blockchain)

```bash
# Build
cd packages/engine && npm install && npm run build && cd ../..
cd packages/gamemaster && npm install && npm run build && cd ../..

# Start GM server
cd packages/gamemaster
LOCAL_MODE=true node dist/index.js
# → Listening on port 3001

# Start spectator (separate terminal)
cd apps/web && npm install && npm run dev
# → http://localhost:3000
```

### Option B: Render Deployment (Remote, No Blockchain)

Deploy the GM server and web spectator to Render for remote access.

**GM Server (Web Service):**
- Runtime: Node
- Repo: `https://github.com/bchuazw/ClawBoardGames`
- Branch: `feature/v2-hybrid`
- Build: `cd packages/engine && npm install && npm run build && cd ../gamemaster && npm install && npm run build`
- Start: `cd packages/gamemaster && node dist/index.js`
- Env: `LOCAL_MODE=true`

**Web Spectator (Web Service):**
- Runtime: Node
- Same repo and branch
- Build: `cd apps/web && npm install && npm run build`
- Start: `cd apps/web && npm start`
- Env: `NEXT_PUBLIC_GM_WS_URL=wss://your-gm-service.onrender.com/ws`

### Option C: Full On-Chain (Base Sepolia)

```bash
# 1. Deploy contracts
cd contracts && npm install
DEPLOYER_KEY=0x... npx hardhat run script/Deploy.ts --network baseSepolia
# → Records MonopolySettlement and CLAWToken addresses

# 2. Start GM server with chain connection
cd packages/gamemaster
SETTLEMENT_ADDRESS=0x... GM_PRIVATE_KEY=0x... RPC_URL=https://sepolia.base.org node dist/index.js
```

### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `LOCAL_MODE` | GM server | Set to `true` to skip blockchain |
| `PORT` | GM server | Default 3001, Render sets automatically |
| `SETTLEMENT_ADDRESS` | GM + SDK | Deployed MonopolySettlement address |
| `GM_PRIVATE_KEY` | GM server | Wallet authorized as `gmSigner` on contract |
| `RPC_URL` | GM + SDK | `https://sepolia.base.org` |
| `DEPLOYER_KEY` | Contract deploy | Private key with Base Sepolia ETH |
| `AGENT_PRIVATE_KEY` | Each agent | Agent wallet with Base Sepolia ETH |
| `GM_WS_URL` | SDK | `ws://hostname:3001/ws` or `wss://...onrender.com/ws` |

---

## For AI Agents

See [docs/OPENCLAW_AGENTS_V2.md](docs/OPENCLAW_AGENTS_V2.md) for the full skill guide.  
See [docs/PLAYTEST_PROMPT.md](docs/PLAYTEST_PROMPT.md) for the OpenClaw playtest prompt.

```typescript
import { OpenClawAgent, SmartPolicy } from "@clawboardgames/sdk";

const agent = new OpenClawAgent({
  privateKey: process.env.AGENT_PRIVATE_KEY,
  rpcUrl: "https://sepolia.base.org",
  settlementAddress: process.env.SETTLEMENT_ADDRESS,
  gmWsUrl: process.env.GM_WS_URL,
  policy: new SmartPolicy(),
});

// Runs the full lifecycle: deposit -> commit -> reveal -> play -> withdraw
await agent.runFullGame(gameId);
```

**Available policies:**

| Policy | Strategy |
|--------|----------|
| `AggressivePolicy` | Buys everything, bids on all auctions |
| `ConservativePolicy` | Buys cheap, saves cash, passes auctions |
| `SmartPolicy` | Balanced: buys if affordable, bids wisely |

---

## License

MIT

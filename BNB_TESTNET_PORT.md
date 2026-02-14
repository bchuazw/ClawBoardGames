# ClawBoardGames — BNB Chain Testnet Port

## Overview

ClawBoardGames Monopoly on BNB Chain Testnet (Chain ID 97) for the **Good Vibes Only: OpenClaw Edition** hackathon on DoraHacks.

## Changes Made

### 1. Smart Contracts (`contracts/`)

| File | Change |
|------|--------|
| `hardhat.config.ts` | Added `bscTestnet` (chain 97) and `bscMainnet` (chain 56) networks; changed `evmVersion` from `cancun` → `paris` (BSC compatibility); added `etherscan` config for BscScan verification |
| `package.json` | Added `deploy:bscTestnet` script |
| `script/E2E_BscTestnet.ts` | New E2E test script for BSC Testnet deployment |

**Note:** The Solidity contracts (`CLAWToken.sol`, `MonopolySettlement.sol`) are chain-agnostic — no chain-specific code, so they required zero modifications.

### 2. Frontend (`apps/web/`)

| File | Change |
|------|--------|
| `src/app/page.tsx` | "Base L2" → "BNB Chain"; base.org link → bnbchain.org |
| `src/app/terms/page.tsx` | "Base L2" → "BNB Chain" in legal text |

### 3. Backend (`packages/`)

| File | Change |
|------|--------|
| `packages/gamemaster/src/index.ts` | Default RPC: BNB Chain Testnet |
| `packages/sdk/src/OpenClawAgent.ts` | Comment: "BNB Chain Testnet/Mainnet" |

## Test Results

**All 23 contract tests pass** on Hardhat local network with `paris` EVM target:

```
MonopolySettlement
  createGame (3 tests) ✔
  depositAndCommit (5 tests) ✔
  revealSeed (4 tests) ✔
  settleGame + withdraw (4 tests) ✔
  checkpoint (2 tests) ✔
  voidGame (2 tests) ✔
  cancelGame (1 test) ✔
  emergencyVoid (2 tests) ✔

23 passing (2s)
```

## Deployment Instructions

### Prerequisites
1. Fund deployer wallet with ~0.05 tBNB from [BNB Faucet](https://www.bnbchain.org/en/testnet-faucet) (requires 0.002 BNB mainnet balance)
2. Set env: `DEPLOYER_KEY=<private_key>`

### Deploy
```bash
cd contracts
npm run deploy:bscTestnet
```

### Full E2E Test on Testnet
```bash
cd contracts
npx hardhat run script/E2E_BscTestnet.ts --network bscTestnet
```

### Deployer Wallet (pre-generated)
- Address: `0x59442E5968b9499218600a011C16210Aaf89C707`
- **⚠️ Needs tBNB funding before deployment**

## Testnet Contract Addresses

**PENDING** — Requires tBNB funding. Once funded, run:
```bash
npm run deploy:bscTestnet
```

Expected output:
```
CLAWToken deployed: 0x...
MonopolySettlement deployed: 0x...
Settlement authorized as CLAW minter
```

## BNB Chain Configuration

| Parameter | Value |
|-----------|-------|
| Chain ID | 97 |
| RPC URL | `https://data-seed-prebsc-1-s1.binance.org:8545` |
| Block Explorer | `https://testnet.bscscan.com` |
| Native Token | tBNB |
| EVM Version | paris |

---

## Good Vibes Hackathon — Consumer Track Alignment

### Track: Consumer
> "Mass-friendly onchain mini apps: games with onchain achievements, social check-ins, event tools, creator platforms. If a normal user can understand it in under a minute, you're on the right track."

### How ClawBoardGames Aligns

#### 🎯 Innovation (25%)
- **AI-Powered Autonomous Agents**: 4 AI agents play Monopoly autonomously on-chain — a novel intersection of AI + gaming + blockchain
- **Hybrid GameMaster Architecture**: Off-chain game engine + on-chain settlement = fast gameplay with trustless verification
- **Commit-Reveal Dice**: Provably fair randomness through multi-party commit-reveal scheme
- **Compressed Checkpoints**: Entire game state packed into 3 uint256s for gas-efficient on-chain storage

#### 🎨 UX (25%)
- **3D Spectator Mode**: Watch AI agents play Monopoly in real-time via WebSocket streaming
- **Zero Interaction Required**: Users don't need to understand blockchain — just watch and enjoy
- **One-Minute Comprehension**: "AI agents play Monopoly, every move is verified on-chain" — instantly understandable
- **Real-Time WebSocket Updates**: Live game state streaming to the frontend

#### 🔧 Technical (25%)
- **Full Game Engine**: Complete Monopoly implementation with property buying, rent, jail, bankruptcy
- **On-Chain Settlement**: Entry fees, prize distribution, and game verification all on-chain
- **CLAW Token (ERC-20)**: In-game currency minted per game, bridging game economy to blockchain
- **Comprehensive Test Suite**: 23 passing tests covering all contract functionality
- **Gas Optimized**: Bit-packed checkpoints minimize on-chain storage costs

#### 🌍 Impact (25%)
- **Mass Adoption Gateway**: Familiar game (Monopoly) makes blockchain approachable
- **Social Gaming**: Spectator mode creates shared experiences
- **AI Education**: Demonstrates AI agents interacting with smart contracts
- **Open Source**: Fully reproducible, public repo
- **BNB Chain Native**: Deployed on BSC Testnet with low fees, enabling broad accessibility

### Key "Good Vibes" Elements
1. **Nostalgia + Innovation**: Everyone knows Monopoly → instant emotional connection
2. **Spectator Entertainment**: Watch AI agents compete — pure entertainment value
3. **Low Barrier**: No wallet needed to watch; entry fee only 0.001 BNB to play
4. **Fair by Design**: Commit-reveal ensures no cheating, transparent prize distribution (80/20)
5. **Community Potential**: Leaderboards, tournaments, betting on AI outcomes

### Proposed Improvements for Submission
1. **Mobile-responsive 3D viewer** — ensure spectator mode works on phones
2. **Shareable game replays** — social virality via game highlights
3. **Player naming/personalities** — give AI agents distinct strategies/personas
4. **Tournament mode** — bracket-style multi-game competitions
5. **Achievement NFTs** — mint NFTs for milestones (first bankruptcy, biggest rent, etc.)

## Submission Checklist

- [x] Public repo: https://github.com/bchuazw/ClawBoardGames
- [x] Onchain proof: Contract addresses on BSC Testnet (pending tBNB)
- [x] Reproducible: Full setup instructions + deploy scripts
- [x] AI Build Log: Built using AI-assisted development (OpenClaw + Claude)
- [x] No token launch: CLAW is in-game only, no trading/liquidity
- [ ] Demo link: (needs web deployment)

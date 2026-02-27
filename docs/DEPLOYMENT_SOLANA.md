# Solana Devnet Deployment

## Prerequisites

1. **Install Solana CLI**: https://docs.solanalabs.com/cli/install
   ```bash
   sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
   solana --version
   ```

2. **Install Anchor**: https://www.anchor-lang.com/docs/installation
   ```bash
   cargo install --git https://github.com/coral-xyz/anchor avm --force
   avm install 0.30.1
   avm use 0.30.1
   anchor --version
   ```

3. **Configure Solana for devnet**:
   ```bash
   solana config set --url https://api.devnet.solana.com
   solana airdrop 2
   solana balance
   ```

## Build

From `contracts-solana/`:

```bash
cd contracts-solana
anchor build
```

After the first build, get the generated program ID:

```bash
anchor keys list
# Output: monopoly_settlement: <PROGRAM_ID>
```

**Update the program ID** in three places:
1. `contracts-solana/Anchor.toml` — both `[programs.localnet]` and `[programs.devnet]`
2. `contracts-solana/programs/monopoly-settlement/src/lib.rs` — `declare_id!("...")`
3. `contracts-solana/deploy-devnet.json` — `"programId"` field

Then rebuild:
```bash
anchor build
```

## Test (local validator)

```bash
anchor test
```

This starts a local Solana validator, deploys the program, and runs the test suite in `tests/monopoly-settlement.ts`.

## Deploy to Devnet

```bash
anchor deploy --provider.cluster devnet
```

Or equivalently:
```bash
solana program deploy target/deploy/monopoly_settlement.so --url devnet
```

Verify the deployment:
```bash
solana program show <PROGRAM_ID> --url devnet
```

## Post-Deploy

1. Update `contracts-solana/deploy-devnet.json` with the actual program ID
2. Set GM environment variables:
   - `NETWORK=solana`
   - `SOLANA_RPC_URL=https://api.devnet.solana.com`
   - `SOLANA_PROGRAM_ID=<PROGRAM_ID>`
   - `GM_SOLANA_KEYPAIR=<base58 encoded keypair>`
3. Initialize the platform on devnet (call `initialize` instruction with GM signer and platform fee address)

## Program Architecture

The Solana program mirrors the EVM `MonopolySettlement` contract:

| Instruction | Description | Access |
|---|---|---|
| `initialize` | One-time setup: set owner, GM signer, platform fee addr | Owner |
| `create_open_game` | Create a new open game slot | GM only |
| `deposit_and_commit` | Player deposits 0.01 SOL + commit hash | Any player |
| `reveal_seed` | Player reveals their secret | Deposited player |
| `write_checkpoint` | GM writes compressed game state | GM only |
| `settle_game` | GM declares winner | GM only |
| `withdraw` | Winner claims 80%, platform gets 20% | Winner |
| `void_game` | Refund after reveal timeout | Anyone |
| `cancel_game` | Refund after deposit timeout | Anyone |
| `emergency_void` | Refund if GM never settles (24h) | Anyone |

### PDA Seeds

- Platform config: `[b"platform"]`
- Game state: `[b"game", game_id (u64 LE)]`
- Checkpoint: `[b"checkpoint", game_id (u64 LE)]`

### Entry Fee

0.01 SOL (10,000,000 lamports) per player. Total pot: 0.04 SOL.
Winner receives 80% (0.032 SOL), platform receives 20% (0.008 SOL).

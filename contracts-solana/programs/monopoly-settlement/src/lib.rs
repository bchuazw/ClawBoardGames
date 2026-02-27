use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_lang::system_program;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub const ENTRY_FEE: u64 = 10_000_000; // 0.01 SOL
pub const NUM_PLAYERS: usize = 4;
pub const WINNER_BPS: u64 = 8000;
pub const PLATFORM_BPS: u64 = 2000;
pub const REVEAL_TIMEOUT: i64 = 120;
pub const DEPOSIT_TIMEOUT: i64 = 600;
pub const GAME_TIMEOUT: i64 = 86400;
pub const MAX_OPEN_GAMES: usize = 20;

// ========== STATE ==========

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum GameStatus {
    Pending,
    Open,
    Depositing,
    Revealing,
    Started,
    Settled,
    Voided,
}

impl Default for GameStatus {
    fn default() -> Self {
        GameStatus::Pending
    }
}

#[account]
pub struct PlatformConfig {
    pub owner: Pubkey,
    pub gm_signer: Pubkey,
    pub platform_fee_addr: Pubkey,
    pub game_count: u64,
    pub open_game_ids: [u64; MAX_OPEN_GAMES],
    pub open_game_count: u8,
    pub bump: u8,
}

impl PlatformConfig {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + (MAX_OPEN_GAMES * 8) + 1 + 1;
}

#[account]
pub struct GameState {
    pub game_id: u64,
    pub status: GameStatus,
    pub players: [Pubkey; NUM_PLAYERS],
    pub commit_hashes: [[u8; 32]; NUM_PLAYERS],
    pub revealed_secrets: [[u8; 32]; NUM_PLAYERS],
    pub deposit_count: u8,
    pub reveal_count: u8,
    pub dice_seed: [u8; 32],
    pub winner: Pubkey,
    pub game_log_hash: [u8; 32],
    pub reveal_deadline: i64,
    pub created_at: i64,
    pub started_at: i64,
    pub winner_paid: bool,
    pub bump: u8,
}

impl GameState {
    pub const SIZE: usize = 8 + 8 + 1 + (NUM_PLAYERS * 32) + (NUM_PLAYERS * 32)
        + (NUM_PLAYERS * 32) + 1 + 1 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct GameCheckpoint {
    pub game_id: u64,
    pub round: u64,
    pub players_packed: u128,
    pub properties_packed: u128,
    pub meta_packed: u128,
    pub bump: u8,
}

impl GameCheckpoint {
    pub const SIZE: usize = 8 + 8 + 8 + 16 + 16 + 16 + 1;
}

// ========== ERRORS ==========

#[error_code]
pub enum SettlementError {
    #[msg("Only the GM signer can call this instruction")]
    NotGM,
    #[msg("Only the owner can call this instruction")]
    NotOwner,
    #[msg("Game is not in the correct status for this operation")]
    InvalidGameStatus,
    #[msg("Incorrect entry fee amount")]
    WrongEntryFee,
    #[msg("Empty commit hash")]
    EmptyCommitHash,
    #[msg("Player has already deposited")]
    AlreadyDeposited,
    #[msg("No empty player slot available")]
    NoEmptySlot,
    #[msg("Player is not in this game")]
    NotAPlayer,
    #[msg("No commit hash found for player")]
    NoCommit,
    #[msg("Player has already revealed")]
    AlreadyRevealed,
    #[msg("Secret hash does not match commit")]
    HashMismatch,
    #[msg("Not the winner")]
    NotWinner,
    #[msg("Winner already paid")]
    AlreadyPaid,
    #[msg("Cannot void: conditions not met")]
    CannotVoid,
    #[msg("Cannot cancel: conditions not met")]
    CannotCancel,
    #[msg("Open game list is full")]
    OpenGamesFull,
    #[msg("Winner is not a player in this game")]
    WinnerNotPlayer,
    #[msg("Cannot emergency void: conditions not met")]
    CannotEmergencyVoid,
}

// ========== PROGRAM ==========

#[program]
pub mod monopoly_settlement {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        gm_signer: Pubkey,
        platform_fee_addr: Pubkey,
    ) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        platform.owner = ctx.accounts.owner.key();
        platform.gm_signer = gm_signer;
        platform.platform_fee_addr = platform_fee_addr;
        platform.game_count = 0;
        platform.open_game_ids = [0u64; MAX_OPEN_GAMES];
        platform.open_game_count = 0;
        platform.bump = ctx.bumps.platform;
        Ok(())
    }

    pub fn create_open_game(ctx: Context<CreateOpenGame>) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        require!(
            platform.gm_signer == ctx.accounts.gm.key(),
            SettlementError::NotGM
        );
        require!(
            (platform.open_game_count as usize) < MAX_OPEN_GAMES,
            SettlementError::OpenGamesFull
        );

        let game_id = platform.game_count;
        let clock = Clock::get()?;

        let game = &mut ctx.accounts.game;
        game.game_id = game_id;
        game.status = GameStatus::Open;
        game.players = [Pubkey::default(); NUM_PLAYERS];
        game.commit_hashes = [[0u8; 32]; NUM_PLAYERS];
        game.revealed_secrets = [[0u8; 32]; NUM_PLAYERS];
        game.deposit_count = 0;
        game.reveal_count = 0;
        game.dice_seed = [0u8; 32];
        game.winner = Pubkey::default();
        game.game_log_hash = [0u8; 32];
        game.reveal_deadline = 0;
        game.created_at = clock.unix_timestamp;
        game.started_at = 0;
        game.winner_paid = false;
        game.bump = ctx.bumps.game;

        let idx = platform.open_game_count as usize;
        platform.open_game_ids[idx] = game_id;
        platform.open_game_count += 1;
        platform.game_count += 1;

        emit!(OpenGameCreated { game_id });
        Ok(())
    }

    pub fn deposit_and_commit(
        ctx: Context<DepositAndCommit>,
        secret_hash: [u8; 32],
    ) -> Result<()> {
        let player_key = ctx.accounts.player.key();
        let (game_id, deposit_count) = {
            let game = &mut ctx.accounts.game;
            require!(
                game.status == GameStatus::Open || game.status == GameStatus::Depositing,
                SettlementError::InvalidGameStatus
            );
            require!(secret_hash != [0u8; 32], SettlementError::EmptyCommitHash);

            for i in 0..NUM_PLAYERS {
                if game.players[i] == player_key && game.commit_hashes[i] != [0u8; 32] {
                    return Err(SettlementError::AlreadyDeposited.into());
                }
            }

            let player_idx = if game.status == GameStatus::Open {
                let mut idx = None;
                for i in 0..NUM_PLAYERS {
                    if game.players[i] == Pubkey::default() {
                        idx = Some(i);
                        break;
                    }
                }
                idx.ok_or(SettlementError::NoEmptySlot)?
            } else {
                let mut idx = None;
                for i in 0..NUM_PLAYERS {
                    if game.players[i] == player_key {
                        idx = Some(i);
                        break;
                    }
                }
                idx.ok_or(SettlementError::NotAPlayer)?
            };

            if game.status == GameStatus::Open {
                game.players[player_idx] = player_key;
            }

            game.commit_hashes[player_idx] = secret_hash;
            game.deposit_count += 1;
            (game.game_id, game.deposit_count)
        };

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.game.to_account_info(),
                },
            ),
            ENTRY_FEE,
        )?;

        emit!(DepositAndCommitEvent {
            game_id,
            player: player_key,
            commit_hash: secret_hash,
        });

        if deposit_count == NUM_PLAYERS as u8 {
            let game = &mut ctx.accounts.game;
            let clock = Clock::get()?;
            game.status = GameStatus::Revealing;
            game.reveal_deadline = clock.unix_timestamp + REVEAL_TIMEOUT;

            let platform = &mut ctx.accounts.platform;
            remove_from_open_games(platform, game.game_id);

            emit!(AllDeposited {
                game_id: game.game_id,
                reveal_deadline: game.reveal_deadline,
            });
        }

        Ok(())
    }

    pub fn reveal_seed(ctx: Context<RevealSeed>, secret: [u8; 32]) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(
            game.status == GameStatus::Revealing,
            SettlementError::InvalidGameStatus
        );

        let player_key = ctx.accounts.player.key();
        let player_idx = find_player_index(game, &player_key)?;

        require!(
            game.commit_hashes[player_idx] != [0u8; 32],
            SettlementError::NoCommit
        );
        require!(
            game.revealed_secrets[player_idx] == [0u8; 32],
            SettlementError::AlreadyRevealed
        );

        let computed_hash = keccak::hash(&secret).to_bytes();
        require!(
            computed_hash == game.commit_hashes[player_idx],
            SettlementError::HashMismatch
        );

        game.revealed_secrets[player_idx] = secret;
        game.reveal_count += 1;

        emit!(SeedRevealed {
            game_id: game.game_id,
            player: player_key,
        });

        if game.reveal_count == NUM_PLAYERS as u8 {
            let mut seed = [0u8; 32];
            for i in 0..NUM_PLAYERS {
                for j in 0..32 {
                    seed[j] ^= game.revealed_secrets[i][j];
                }
            }
            game.dice_seed = seed;
            game.status = GameStatus::Started;
            game.started_at = Clock::get()?.unix_timestamp;

            emit!(GameStarted {
                game_id: game.game_id,
                dice_seed: seed,
            });
        }

        Ok(())
    }

    pub fn write_checkpoint(
        ctx: Context<WriteCheckpoint>,
        round: u64,
        players_packed: u128,
        properties_packed: u128,
        meta_packed: u128,
    ) -> Result<()> {
        let game = &ctx.accounts.game;
        require!(
            game.status == GameStatus::Started,
            SettlementError::InvalidGameStatus
        );

        let checkpoint = &mut ctx.accounts.checkpoint;
        checkpoint.game_id = game.game_id;
        checkpoint.round = round;
        checkpoint.players_packed = players_packed;
        checkpoint.properties_packed = properties_packed;
        checkpoint.meta_packed = meta_packed;
        if checkpoint.bump == 0 {
            checkpoint.bump = ctx.bumps.checkpoint;
        }

        emit!(CheckpointWritten {
            game_id: game.game_id,
            round,
        });

        Ok(())
    }

    pub fn settle_game(
        ctx: Context<SettleGame>,
        winner_pubkey: Pubkey,
        game_log_hash: [u8; 32],
    ) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(
            game.status == GameStatus::Started,
            SettlementError::InvalidGameStatus
        );
        require!(
            is_player(game, &winner_pubkey),
            SettlementError::WinnerNotPlayer
        );

        game.winner = winner_pubkey;
        game.game_log_hash = game_log_hash;
        game.status = GameStatus::Settled;

        emit!(GameSettledEvent {
            game_id: game.game_id,
            winner: winner_pubkey,
            game_log_hash,
        });

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let (game_id, winner) = {
            let game = &mut ctx.accounts.game;
            require!(
                game.status == GameStatus::Settled,
                SettlementError::InvalidGameStatus
            );
            require!(
                ctx.accounts.winner.key() == game.winner,
                SettlementError::NotWinner
            );
            require!(!game.winner_paid, SettlementError::AlreadyPaid);

            game.winner_paid = true;
            (game.game_id, game.winner)
        };

        let total_pot = ENTRY_FEE * NUM_PLAYERS as u64;
        let winner_share = total_pot * WINNER_BPS / 10_000;
        let platform_share = total_pot - winner_share;

        **ctx
            .accounts
            .game
            .to_account_info()
            .try_borrow_mut_lamports()? -= winner_share;
        **ctx
            .accounts
            .winner
            .to_account_info()
            .try_borrow_mut_lamports()? += winner_share;

        **ctx
            .accounts
            .game
            .to_account_info()
            .try_borrow_mut_lamports()? -= platform_share;
        **ctx
            .accounts
            .platform_fee_account
            .to_account_info()
            .try_borrow_mut_lamports()? += platform_share;

        emit!(Withdrawn {
            game_id,
            winner,
            amount: winner_share,
        });

        Ok(())
    }

    pub fn void_game(ctx: Context<VoidGame>) -> Result<()> {
        let (game_id, to_refund) = {
            let game = &mut ctx.accounts.game;
            let clock = Clock::get()?;

            require!(
                game.status == GameStatus::Revealing
                    && clock.unix_timestamp > game.reveal_deadline,
                SettlementError::CannotVoid
            );

            game.status = GameStatus::Voided;
            let to_refund: Vec<Pubkey> = ctx
                .remaining_accounts
                .iter()
                .filter(|r| is_player(game, &r.key()) && has_deposit(game, &r.key()))
                .map(|r| r.key())
                .collect();
            (game.game_id, to_refund)
        };

        for remaining in ctx.remaining_accounts.iter() {
            if to_refund.contains(&remaining.key()) {
                **ctx
                    .accounts
                    .game
                    .to_account_info()
                    .try_borrow_mut_lamports()? -= ENTRY_FEE;
                **remaining.try_borrow_mut_lamports()? += ENTRY_FEE;
            }
        }

        emit!(GameVoided { game_id });

        Ok(())
    }

    pub fn cancel_game(ctx: Context<CancelGame>) -> Result<()> {
        let (game_id, to_refund) = {
            let game = &mut ctx.accounts.game;
            let clock = Clock::get()?;

            require!(
                (game.status == GameStatus::Depositing || game.status == GameStatus::Open)
                    && clock.unix_timestamp > game.created_at + DEPOSIT_TIMEOUT,
                SettlementError::CannotCancel
            );

            if game.status == GameStatus::Open {
                let platform = &mut ctx.accounts.platform;
                remove_from_open_games(platform, game.game_id);
            }

            game.status = GameStatus::Voided;
            let to_refund: Vec<Pubkey> = ctx
                .remaining_accounts
                .iter()
                .filter(|r| has_deposit(game, &r.key()))
                .map(|r| r.key())
                .collect();
            (game.game_id, to_refund)
        };

        for remaining in ctx.remaining_accounts.iter() {
            if to_refund.contains(&remaining.key()) {
                **ctx
                    .accounts
                    .game
                    .to_account_info()
                    .try_borrow_mut_lamports()? -= ENTRY_FEE;
                **remaining.try_borrow_mut_lamports()? += ENTRY_FEE;
            }
        }

        emit!(GameVoided { game_id });

        Ok(())
    }

    pub fn emergency_void(ctx: Context<EmergencyVoid>) -> Result<()> {
        let (game_id, to_refund) = {
            let game = &mut ctx.accounts.game;
            let clock = Clock::get()?;

            require!(
                game.status == GameStatus::Started
                    && clock.unix_timestamp > game.started_at + GAME_TIMEOUT,
                SettlementError::CannotEmergencyVoid
            );

            game.status = GameStatus::Voided;
            let to_refund: Vec<Pubkey> = ctx
                .remaining_accounts
                .iter()
                .filter(|r| is_player(game, &r.key()))
                .map(|r| r.key())
                .collect();
            (game.game_id, to_refund)
        };

        for remaining in ctx.remaining_accounts.iter() {
            if to_refund.contains(&remaining.key()) {
                **ctx
                    .accounts
                    .game
                    .to_account_info()
                    .try_borrow_mut_lamports()? -= ENTRY_FEE;
                **remaining.try_borrow_mut_lamports()? += ENTRY_FEE;
            }
        }

        emit!(GameVoided { game_id });

        Ok(())
    }

    pub fn set_gm_signer(ctx: Context<AdminUpdate>, new_gm: Pubkey) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        require!(
            platform.owner == ctx.accounts.owner.key(),
            SettlementError::NotOwner
        );
        platform.gm_signer = new_gm;
        Ok(())
    }

    pub fn set_platform_fee_addr(ctx: Context<AdminUpdate>, new_addr: Pubkey) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        require!(
            platform.owner == ctx.accounts.owner.key(),
            SettlementError::NotOwner
        );
        platform.platform_fee_addr = new_addr;
        Ok(())
    }
}

// ========== HELPERS ==========

fn find_player_index(game: &GameState, player: &Pubkey) -> Result<usize> {
    for i in 0..NUM_PLAYERS {
        if game.players[i] == *player {
            return Ok(i);
        }
    }
    Err(SettlementError::NotAPlayer.into())
}

fn is_player(game: &GameState, addr: &Pubkey) -> bool {
    game.players.iter().any(|p| p == addr)
}

fn has_deposit(game: &GameState, addr: &Pubkey) -> bool {
    for i in 0..NUM_PLAYERS {
        if game.players[i] == *addr && game.commit_hashes[i] != [0u8; 32] {
            return true;
        }
    }
    false
}

fn remove_from_open_games(platform: &mut PlatformConfig, game_id: u64) {
    let count = platform.open_game_count as usize;
    for i in 0..count {
        if platform.open_game_ids[i] == game_id {
            platform.open_game_ids[i] = platform.open_game_ids[count - 1];
            platform.open_game_ids[count - 1] = 0;
            platform.open_game_count -= 1;
            return;
        }
    }
}

// ========== ACCOUNT CONTEXTS ==========

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = PlatformConfig::SIZE,
        seeds = [b"platform"],
        bump,
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateOpenGame<'info> {
    #[account(
        mut,
        seeds = [b"platform"],
        bump = platform.bump,
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(
        init,
        payer = gm,
        space = GameState::SIZE,
        seeds = [b"game", platform.game_count.to_le_bytes().as_ref()],
        bump,
    )]
    pub game: Account<'info, GameState>,
    #[account(mut)]
    pub gm: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositAndCommit<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, GameState>,
    #[account(
        mut,
        seeds = [b"platform"],
        bump = platform.bump,
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealSeed<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, GameState>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct WriteCheckpoint<'info> {
    #[account(
        seeds = [b"platform"],
        bump = platform.bump,
        constraint = platform.gm_signer == gm.key() @ SettlementError::NotGM,
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, GameState>,
    #[account(
        init_if_needed,
        payer = gm,
        space = GameCheckpoint::SIZE,
        seeds = [b"checkpoint", game.game_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub checkpoint: Account<'info, GameCheckpoint>,
    #[account(mut)]
    pub gm: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleGame<'info> {
    #[account(
        seeds = [b"platform"],
        bump = platform.bump,
        constraint = platform.gm_signer == gm.key() @ SettlementError::NotGM,
    )]
    pub platform: Account<'info, PlatformConfig>,
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, GameState>,
    pub gm: Signer<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, GameState>,
    #[account(mut)]
    pub winner: Signer<'info>,
    /// CHECK: platform fee recipient validated against PlatformConfig
    #[account(
        mut,
        constraint = platform_fee_account.key() == platform.platform_fee_addr,
    )]
    pub platform_fee_account: AccountInfo<'info>,
    #[account(
        seeds = [b"platform"],
        bump = platform.bump,
    )]
    pub platform: Account<'info, PlatformConfig>,
}

#[derive(Accounts)]
pub struct VoidGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, GameState>,
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, GameState>,
    #[account(
        mut,
        seeds = [b"platform"],
        bump = platform.bump,
    )]
    pub platform: Account<'info, PlatformConfig>,
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyVoid<'info> {
    #[account(
        mut,
        seeds = [b"game", game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, GameState>,
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminUpdate<'info> {
    #[account(
        mut,
        seeds = [b"platform"],
        bump = platform.bump,
    )]
    pub platform: Account<'info, PlatformConfig>,
    pub owner: Signer<'info>,
}

// ========== EVENTS ==========

#[event]
pub struct OpenGameCreated {
    pub game_id: u64,
}

#[event]
pub struct DepositAndCommitEvent {
    pub game_id: u64,
    pub player: Pubkey,
    pub commit_hash: [u8; 32],
}

#[event]
pub struct AllDeposited {
    pub game_id: u64,
    pub reveal_deadline: i64,
}

#[event]
pub struct SeedRevealed {
    pub game_id: u64,
    pub player: Pubkey,
}

#[event]
pub struct GameStarted {
    pub game_id: u64,
    pub dice_seed: [u8; 32],
}

#[event]
pub struct CheckpointWritten {
    pub game_id: u64,
    pub round: u64,
}

#[event]
pub struct GameSettledEvent {
    pub game_id: u64,
    pub winner: Pubkey,
    pub game_log_hash: [u8; 32],
}

#[event]
pub struct Withdrawn {
    pub game_id: u64,
    pub winner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct GameVoided {
    pub game_id: u64,
}

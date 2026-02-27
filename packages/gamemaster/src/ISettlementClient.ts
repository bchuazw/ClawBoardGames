export interface GameInfo {
  players: string[];
  status: number;
  depositCount: number;
  revealCount: number;
  diceSeed: string;
  winner: string;
  revealDeadline: bigint;
  winnerPaid: boolean;
}

export interface CheckpointInfo {
  round: number;
  playersPacked: bigint;
  propertiesPacked: bigint;
  metaPacked: bigint;
}

export interface ISettlementClient {
  writeCheckpoint(
    gameId: number,
    round: number,
    playersPacked: bigint,
    propertiesPacked: bigint,
    metaPacked: bigint,
  ): Promise<string>;

  settleGame(gameId: number, winnerAddress: string, gameLogHash: string): Promise<string>;

  getGame(gameId: number): Promise<GameInfo>;

  getCheckpoint(gameId: number): Promise<CheckpointInfo>;

  getGameCount(): Promise<number>;

  getOpenGameIds(): Promise<number[]>;

  createOpenGame(): Promise<void>;

  onGameStarted(callback: (gameId: number, diceSeed: string) => void): void;

  get address(): string;
}

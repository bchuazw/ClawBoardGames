import { ethers, Contract, Wallet, Provider, JsonRpcProvider } from "ethers";

/**
 * Client for interacting with MonopolySettlement contract from the GM server.
 */
export class SettlementClient {
  private contract: Contract;
  private wallet: Wallet;

  constructor(
    rpcUrl: string,
    contractAddress: string,
    gmPrivateKey: string,
  ) {
    const provider: Provider = new JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(gmPrivateKey, provider);
    this.contract = new Contract(contractAddress, SETTLEMENT_ABI, this.wallet);
  }

  /** Write a checkpoint to the chain. */
  async writeCheckpoint(
    gameId: number,
    round: number,
    playersPacked: bigint,
    propertiesPacked: bigint,
    metaPacked: bigint,
  ): Promise<string> {
    const tx = await this.contract.checkpoint(gameId, round, playersPacked, propertiesPacked, metaPacked);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Settle the game on-chain. */
  async settleGame(gameId: number, winnerAddress: string, gameLogHash: string): Promise<string> {
    const tx = await this.contract.settleGame(gameId, winnerAddress, gameLogHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Read game info from chain. */
  async getGame(gameId: number): Promise<{
    players: string[];
    status: number;
    depositCount: number;
    revealCount: number;
    diceSeed: string;
    winner: string;
    revealDeadline: bigint;
  }> {
    const result = await this.contract.getGame(gameId);
    return {
      players: result.players,
      status: Number(result.status),
      depositCount: Number(result.depositCount),
      revealCount: Number(result.revealCount),
      diceSeed: result.diceSeed,
      winner: result.winner,
      revealDeadline: result.revealDeadline,
    };
  }

  /** Read checkpoint from chain. */
  async getCheckpoint(gameId: number): Promise<{
    round: number;
    playersPacked: bigint;
    propertiesPacked: bigint;
    metaPacked: bigint;
  }> {
    const result = await this.contract.getCheckpoint(gameId);
    return {
      round: Number(result.round),
      playersPacked: result.playersPacked,
      propertiesPacked: result.propertiesPacked,
      metaPacked: result.metaPacked,
    };
  }

  /** Listen for GameStarted events to spawn GM processes. */
  onGameStarted(callback: (gameId: number, diceSeed: string) => void): void {
    this.contract.on("GameStarted", (gameId: bigint, diceSeed: string) => {
      callback(Number(gameId), diceSeed);
    });
  }

  /** Get the GM signer address. */
  get address(): string {
    return this.wallet.address;
  }
}

// Minimal ABI for GM interactions
const SETTLEMENT_ABI = [
  "function checkpoint(uint256 gameId, uint256 round, uint256 playersPacked, uint256 propertiesPacked, uint256 metaPacked) external",
  "function settleGame(uint256 gameId, address winner, bytes32 gameLogHash) external",
  "function getGame(uint256 gameId) external view returns (address[4] players, uint8 status, uint8 depositCount, uint8 revealCount, bytes32 diceSeed, address winner, uint256 revealDeadline)",
  "function getCheckpoint(uint256 gameId) external view returns (uint256 round, uint256 playersPacked, uint256 propertiesPacked, uint256 metaPacked)",
  "event GameStarted(uint256 indexed gameId, bytes32 diceSeed)",
  "event GameCreated(uint256 indexed gameId, address[4] players)",
];

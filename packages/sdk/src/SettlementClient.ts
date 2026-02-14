import { Contract, Wallet, JsonRpcProvider, keccak256, solidityPacked, randomBytes } from "ethers";

/**
 * Agent-side client for the MonopolySettlement contract.
 * Handles: depositAndCommit, revealSeed, withdraw.
 */
export class SettlementClient {
  private contract: Contract;
  private wallet: Wallet;
  private secret: Uint8Array | null = null;

  constructor(
    rpcUrl: string,
    contractAddress: string,
    agentPrivateKey: string,
  ) {
    const provider = new JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(agentPrivateKey, provider);
    this.contract = new Contract(contractAddress, SETTLEMENT_ABI, this.wallet);
  }

  /** Get the agent's address. */
  get address(): string {
    return this.wallet.address;
  }

  /**
   * Generate a random secret for commit-reveal dice.
   * Returns the secret (keep private!) and the hash (submit to contract).
   */
  generateSecret(): { secret: Uint8Array; secretHash: string } {
    this.secret = randomBytes(32);
    const secretHash = keccak256(solidityPacked(["bytes32"], [this.secret]));
    return { secret: this.secret, secretHash };
  }

  /**
   * Deposit entry fee + commit dice secret in one transaction.
   * Call generateSecret() first.
   */
  async depositAndCommit(gameId: number, secretHash?: string): Promise<string> {
    const hash = secretHash || (this.secret ? keccak256(solidityPacked(["bytes32"], [this.secret])) : null);
    if (!hash) throw new Error("No secret generated. Call generateSecret() first.");

    const tx = await this.contract.depositAndCommit(gameId, hash, {
      value: "1000000000000000", // 0.001 BNB (native)
      gasLimit: 400_000,
    });
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Reveal the dice secret. Must match the commit hash.
   */
  async revealSeed(gameId: number, secret?: Uint8Array): Promise<string> {
    const s = secret || this.secret;
    if (!s) throw new Error("No secret to reveal. Call generateSecret() first.");

    const tx = await this.contract.revealSeed(gameId, s, { gasLimit: 300_000 });
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Withdraw prize after game settlement.
   */
  async withdraw(gameId: number): Promise<string> {
    const tx = await this.contract.withdraw(gameId);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Read game state from contract.
   */
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
}

const SETTLEMENT_ABI = [
  "function depositAndCommit(uint256 gameId, bytes32 secretHash) external payable",
  "function revealSeed(uint256 gameId, bytes32 secret) external",
  "function withdraw(uint256 gameId) external",
  "function getGame(uint256 gameId) external view returns (address[4] players, uint8 status, uint8 depositCount, uint8 revealCount, bytes32 diceSeed, address winner, uint256 revealDeadline)",
  "event GameStarted(uint256 indexed gameId, bytes32 diceSeed)",
  "event AllDeposited(uint256 indexed gameId, uint256 revealDeadline)",
  "event GameSettled(uint256 indexed gameId, address indexed winner, bytes32 gameLogHash)",
];

/**
 * Optional escrow helpers for on-chain create/join/cancel.
 * Use when your ClawMate backend uses the ChessBetEscrow contract; pass your own provider, signer, and contract address.
 */

import { Contract } from "ethers";

const ESCROW_ABI = [
  "function createLobby() external payable",
  "function joinLobby(uint256 gameId) external payable",
  "function cancelLobby(uint256 gameId) external",
  "function games(uint256) view returns (address player1, address player2, uint256 betAmount, bool active, address winner)",
  "event LobbyCreated(uint256 gameId, address player1, uint256 betAmount)",
  "event LobbyJoined(uint256 gameId, address player2)",
  "event LobbyCancelled(uint256 gameId, address player1)",
];

/**
 * Create a lobby on the escrow contract (pay bet). Returns contract gameId (1-based).
 * @param {{ signer: import('ethers').Signer, contractAddress: string, betWei: string | bigint }}
 */
export async function createLobbyOnChain({ signer, contractAddress, betWei }) {
  const amount = BigInt(betWei);
  if (amount <= 0n) throw new Error("Bet must be > 0");
  const contract = new Contract(contractAddress, ESCROW_ABI, signer);
  const tx = await contract.createLobby({ value: amount });
  const receipt = await tx.wait();
  const log = receipt?.logs?.find((l) => {
    try {
      const parsed = contract.interface.parseLog({ topics: l.topics, data: l.data });
      return parsed?.name === "LobbyCreated";
    } catch {
      return false;
    }
  });
  if (!log) throw new Error("LobbyCreated event not found");
  const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
  return Number(parsed.args.gameId);
}

/**
 * Join a lobby on the escrow contract (pay bet).
 * @param {{ signer: import('ethers').Signer, contractAddress: string, gameId: number, betWei: string | bigint }}
 */
export async function joinLobbyOnChain({ signer, contractAddress, gameId, betWei }) {
  const amount = BigInt(betWei);
  if (amount <= 0n) throw new Error("Bet must be > 0");
  const contract = new Contract(contractAddress, ESCROW_ABI, signer);
  const tx = await contract.joinLobby(gameId, { value: amount });
  await tx.wait();
}

/**
 * Cancel your waiting lobby on-chain (refunds creator). Creator only, no opponent yet.
 * @param {{ signer: import('ethers').Signer, contractAddress: string, gameId: number }}
 */
export async function cancelLobbyOnChain({ signer, contractAddress, gameId }) {
  const contract = new Contract(contractAddress, ESCROW_ABI, signer);
  const tx = await contract.cancelLobby(gameId);
  await tx.wait();
}

/**
 * Read game state from the contract (no tx).
 * @param {{ provider: import('ethers').Provider, contractAddress: string, gameId: number }}
 */
export async function getGameStateOnChain({ provider, contractAddress, gameId }) {
  const contract = new Contract(contractAddress, ESCROW_ABI, provider);
  const g = await contract.games(gameId);
  const player1 = g?.player1 ?? g?.[0];
  const player2 = g?.player2 ?? g?.[1];
  const betAmount = g?.betAmount ?? g?.[2];
  const active = g?.active ?? g?.[3];
  if (player1 == null) return null;
  const zero = "0x0000000000000000000000000000000000000000";
  return {
    active: Boolean(active),
    player1: (player1 || zero).toLowerCase(),
    player2: (player2 || zero).toLowerCase(),
    betAmount: betAmount != null ? String(betAmount) : "0",
  };
}

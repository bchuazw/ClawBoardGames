/**
 * clawmate-sdk — SDK for OpenClaw agents to connect to ClawMate (chess on Monad).
 *
 * Usage:
 *   import { ClawmateClient } from 'clawmate-sdk';
 *   import { Wallet } from 'ethers';
 *
 *   const signer = new Wallet(process.env.PRIVATE_KEY, provider);
 *   const client = new ClawmateClient({ baseUrl: 'http://localhost:4000', signer });
 *   await client.connect();
 *
 *   client.on('lobby_joined_yours', (data) => { ... });
 *   client.on('move', (data) => { ... });
 *
 *   const lobbies = await client.getLobbies();
 *   const lobby = await client.createLobby({ betAmountWei: '0' });
 *   client.joinGame(lobby.lobbyId);
 *   client.makeMove(lobby.lobbyId, 'e2', 'e4');
 */

export { ClawmateClient } from "./src/ClawmateClient.js";
export * from "./src/signing.js";
export * from "./src/escrow.js";
export * from "./src/utils.js";

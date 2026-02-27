/**
 * Solana message signing for ClawMate API auth.
 * Expects signer with { getAddress(): Promise<string>, signMessage(message: string): Promise<{ signature: Uint8Array }> }
 * (e.g. Phantom wallet adapter).
 */

const DOMAIN = "ClawMate";

function buildCreateLobbyMessage(betAmount, contractGameId) {
  const timestamp = Date.now();
  return `${DOMAIN} create lobby\nBet: ${betAmount}\nContractGameId: ${contractGameId ?? ""}\nTimestamp: ${timestamp}`;
}

function buildJoinLobbyMessage(lobbyId) {
  const timestamp = Date.now();
  return `${DOMAIN} join lobby\nLobbyId: ${lobbyId}\nTimestamp: ${timestamp}`;
}

function buildCancelLobbyMessage(lobbyId) {
  const timestamp = Date.now();
  return `${DOMAIN} cancel lobby\nLobbyId: ${lobbyId}\nTimestamp: ${timestamp}`;
}

function buildConcedeLobbyMessage(lobbyId) {
  const timestamp = Date.now();
  return `${DOMAIN} concede lobby\nLobbyId: ${lobbyId}\nTimestamp: ${timestamp}`;
}

function buildTimeoutLobbyMessage(lobbyId) {
  const timestamp = Date.now();
  return `${DOMAIN} timeout lobby\nLobbyId: ${lobbyId}\nTimestamp: ${timestamp}`;
}

function buildMoveMessage(lobbyId, from, to, promotion) {
  const timestamp = Date.now();
  return `${DOMAIN} move\nLobbyId: ${lobbyId}\nFrom: ${from}\nTo: ${to}\nPromotion: ${promotion || "q"}\nTimestamp: ${timestamp}`;
}

function buildRegisterWalletMessage() {
  const timestamp = Date.now();
  return `${DOMAIN} register wallet\nTimestamp: ${timestamp}`;
}

function buildSetUsernameMessage(username) {
  const trimmed = typeof username === "string" ? username.trim() : "";
  const timestamp = Date.now();
  return `${DOMAIN} username: ${trimmed}\nTimestamp: ${timestamp}`;
}

/** @param {{ signMessage: (m: Uint8Array) => Promise<{ signature: Uint8Array }> }} signer - Phantom adapter */
async function signMessage(signer, message) {
  const msgBytes = new TextEncoder().encode(message);
  const { signature } = await signer.signMessage(msgBytes);
  const bs58 = (await import("bs58")).default;
  return bs58.encode(signature instanceof Uint8Array ? signature : new Uint8Array(signature));
}

export async function signCreateLobby(signer, opts) {
  const message = buildCreateLobbyMessage(opts.betAmount, opts.contractGameId ?? null);
  const signature = await signMessage(signer, message);
  return { message, signature };
}

export async function signJoinLobby(signer, lobbyId) {
  const message = buildJoinLobbyMessage(lobbyId);
  const signature = await signMessage(signer, message);
  return { message, signature };
}

export async function signCancelLobby(signer, lobbyId) {
  const message = buildCancelLobbyMessage(lobbyId);
  const signature = await signMessage(signer, message);
  return { message, signature };
}

export async function signConcedeLobby(signer, lobbyId) {
  const message = buildConcedeLobbyMessage(lobbyId);
  const signature = await signMessage(signer, message);
  return { message, signature };
}

export async function signTimeoutLobby(signer, lobbyId) {
  const message = buildTimeoutLobbyMessage(lobbyId);
  const signature = await signMessage(signer, message);
  return { message, signature };
}

export async function signMove(signer, lobbyId, from, to, promotion) {
  const message = buildMoveMessage(lobbyId, from, to, promotion);
  const signature = await signMessage(signer, message);
  return { message, signature };
}

export async function signRegisterWallet(signer) {
  const message = buildRegisterWalletMessage();
  const signature = await signMessage(signer, message);
  return { message, signature };
}

export async function signSetUsername(signer, username) {
  const trimmed = typeof username === "string" ? username.trim() : "";
  const message = buildSetUsernameMessage(trimmed);
  const signature = await signMessage(signer, message);
  return { message, signature };
}

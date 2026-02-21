import { BrowserProvider } from "ethers";

const DOMAIN = "ClawMate";

export async function signMessage(message) {
  if (typeof window === "undefined" || !window.ethereum) throw new Error("No wallet found");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}

export async function signCreateLobby({ betAmount, contractGameId }) {
  const timestamp = Date.now();
  const message = `${DOMAIN} create lobby\nBet: ${betAmount}\nContractGameId: ${contractGameId ?? ""}\nTimestamp: ${timestamp}`;
  const signature = await signMessage(message);
  return { message, signature };
}

export async function signJoinLobby(lobbyId) {
  const timestamp = Date.now();
  const message = `${DOMAIN} join lobby\nLobbyId: ${lobbyId}\nTimestamp: ${timestamp}`;
  const signature = await signMessage(message);
  return { message, signature };
}

export async function signCancelLobby(lobbyId) {
  const timestamp = Date.now();
  const message = `${DOMAIN} cancel lobby\nLobbyId: ${lobbyId}\nTimestamp: ${timestamp}`;
  const signature = await signMessage(message);
  return { message, signature };
}

export async function signConcedeLobby(lobbyId) {
  const timestamp = Date.now();
  const message = `${DOMAIN} concede lobby\nLobbyId: ${lobbyId}\nTimestamp: ${timestamp}`;
  const signature = await signMessage(message);
  return { message, signature };
}

export async function signTimeoutLobby(lobbyId) {
  const timestamp = Date.now();
  const message = `${DOMAIN} timeout lobby\nLobbyId: ${lobbyId}\nTimestamp: ${timestamp}`;
  const signature = await signMessage(message);
  return { message, signature };
}

export async function signRegisterWallet() {
  const timestamp = Date.now();
  const message = `${DOMAIN} register wallet\nTimestamp: ${timestamp}`;
  const signature = await signMessage(message);
  return { message, signature };
}

export async function signSetUsername(username) {
  const trimmed = typeof username === "string" ? username.trim() : "";
  const timestamp = Date.now();
  const message = `${DOMAIN} username: ${trimmed}\nTimestamp: ${timestamp}`;
  const signature = await signMessage(message);
  return { message, signature };
}

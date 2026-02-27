/**
 * Escrow config and UI helpers only. On-chain logic uses clawmate-sdk (platform).
 * Supports EVM (Monad), BNB testnet, and Solana (chess_bet_escrow program).
 */

const ESCROW_ADDRESS =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_ESCROW_CONTRACT_ADDRESS) || "";

const BNB_ESCROW_ADDRESS =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_BNB_ESCROW_CONTRACT_ADDRESS) || "";

const SOLANA_ESCROW_PROGRAM_ID =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_SOLANA_ESCROW_PROGRAM_ID) || "";

const SOLANA_RPC_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_SOLANA_RPC_URL) || "https://api.devnet.solana.com";

export function getEscrowAddress() {
  return ESCROW_ADDRESS || null;
}

export function hasEscrow() {
  return Boolean(ESCROW_ADDRESS);
}

export function getBnbEscrowAddress() {
  return BNB_ESCROW_ADDRESS || null;
}

export function hasBnbEscrow() {
  return Boolean(BNB_ESCROW_ADDRESS);
}

export function getSolanaProgramId() {
  return SOLANA_ESCROW_PROGRAM_ID || null;
}

export function getSolanaRpcUrl() {
  return SOLANA_RPC_URL;
}

export function hasSolanaEscrow() {
  return Boolean(SOLANA_ESCROW_PROGRAM_ID);
}

export async function getContractBalance() {
  return getContractBalanceForChain("evm");
}

/** Get escrow contract balance for the given chain (evm=Monad, bnb=BNB testnet). */
export async function getContractBalanceForChain(chain) {
  const addr = chain === "bnb" ? BNB_ESCROW_ADDRESS : ESCROW_ADDRESS;
  if (!addr || typeof window === "undefined" || !window.ethereum) return null;
  try {
    const { BrowserProvider } = await import("ethers");
    const provider = new BrowserProvider(window.ethereum);
    return await provider.getBalance(addr);
  } catch {
    return null;
  }
}

/** Get escrow address for the given chain. */
export function getEscrowAddressForChain(chain) {
  return chain === "bnb" ? getBnbEscrowAddress() : getEscrowAddress();
}

/** Human-readable message when on-chain cancel fails (used with SDK cancelLobbyOnChain). */
export function toCancelErrorMessage(e) {
  const msg = e?.reason ?? e?.shortMessage ?? e?.message ?? "";
  if (msg.includes("Only creator can cancel") || msg.includes("NotCreator")) return "Only the lobby creator can cancel.";
  if (msg.includes("Lobby already has opponent") || msg.includes("LobbyHasOpponent")) return "Someone already joined; you cannot cancel.";
  if (msg.includes("Game not active") || msg.includes("GameNotActive")) return "This lobby was already cancelled on-chain.";
  if (msg.includes("missing revert data") || msg.includes("CALL_EXCEPTION") || e?.code === "CALL_EXCEPTION") {
    return "Cancel failed on-chain. Check that you're the creator, no one has joined, and you're on the correct network. If you already cancelled, refresh the page.";
  }
  if (msg.includes("user rejected") || msg.includes("rejected")) return "Transaction was rejected.";
  return msg || "Cancel failed. Check your network and try again.";
}

/** Convert lamports to SOL string for display. */
export function lamportsToSol(lamports) {
  if (lamports == null || lamports === "" || lamports === "0") return "0";
  const n = Number(lamports);
  if (Number.isNaN(n)) return String(lamports);
  return (n / 1e9).toFixed(9).replace(/\.?0+$/, "") || "0";
}

/** Convert SOL (number or string) to lamports. */
export function solToLamports(sol) {
  if (sol == null || sol === "") return 0;
  const n = typeof sol === "number" ? sol : parseFloat(String(sol));
  if (Number.isNaN(n) || n < 0) return -1;
  return Math.floor(n * 1e9);
}

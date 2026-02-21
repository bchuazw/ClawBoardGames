/**
 * Escrow config and UI helpers only. On-chain logic uses clawmate-sdk (platform).
 */

const ESCROW_ADDRESS =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CLAWMATE_ESCROW_CONTRACT_ADDRESS) || "";

export function getEscrowAddress() {
  return ESCROW_ADDRESS || null;
}

export function hasEscrow() {
  return Boolean(ESCROW_ADDRESS);
}

export async function getContractBalance() {
  if (!hasEscrow() || typeof window === "undefined" || !window.ethereum) return null;
  try {
    const { BrowserProvider } = await import("ethers");
    const provider = new BrowserProvider(window.ethereum);
    return await provider.getBalance(ESCROW_ADDRESS);
  } catch {
    return null;
  }
}

/** Human-readable message when on-chain cancel fails (used with SDK cancelLobbyOnChain). */
export function toCancelErrorMessage(e) {
  const msg = e?.reason ?? e?.shortMessage ?? e?.message ?? "";
  if (msg.includes("Only creator can cancel")) return "Only the lobby creator can cancel.";
  if (msg.includes("Lobby already has opponent")) return "Someone already joined; you cannot cancel.";
  if (msg.includes("Game not active")) return "This lobby was already cancelled on-chain.";
  if (msg.includes("missing revert data") || msg.includes("CALL_EXCEPTION") || e?.code === "CALL_EXCEPTION") {
    return "Cancel failed on-chain. Check that you're the creator, no one has joined, and you're on the correct network. If you already cancelled, refresh the page.";
  }
  if (msg.includes("user rejected") || msg.includes("rejected")) return "Transaction was rejected.";
  return msg || "Cancel failed. Check your network and try again.";
}

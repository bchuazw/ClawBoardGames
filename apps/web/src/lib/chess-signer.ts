/**
 * Browser wallet helpers so /chess uses the same logic as clawmate-sdk (platform).
 * Supports EVM (MetaMask) and Solana (Phantom).
 */
import { BrowserProvider, type Signer, type Eip1193Provider } from "ethers";

export function getBrowserProvider(): BrowserProvider | null {
  if (typeof window === "undefined" || !window.ethereum) return null;
  return new BrowserProvider(window.ethereum as Eip1193Provider);
}

export async function getBrowserSigner(): Promise<Signer | null> {
  const provider = getBrowserProvider();
  if (!provider) return null;
  return provider.getSigner();
}

/** Phantom wallet. Returns null if Phantom not installed or not connected. */
export function getSolanaWallet(): { publicKey: { toBase58(): string }; signMessage: (msg: Uint8Array) => Promise<{ signature: Uint8Array }>; signTransaction: (tx: unknown) => Promise<unknown> } | null {
  if (typeof window === "undefined") return null;
  const w = (window as unknown as { solana?: { isPhantom?: boolean; publicKey?: { toBase58(): string }; signMessage?: (m: Uint8Array) => Promise<{ signature: Uint8Array }>; signTransaction?: (tx: unknown) => Promise<unknown> } }).solana;
  if (!w?.isPhantom || !w.publicKey) return null;
  return w as { publicKey: { toBase58(): string }; signMessage: (msg: Uint8Array) => Promise<{ signature: Uint8Array }>; signTransaction: (tx: unknown) => Promise<unknown> };
}

/**
 * Connect Phantom and return pubkey (base58). Call from WalletBar when user clicks Connect.
 */
export async function connectSolanaWallet(): Promise<string | null> {
  const w = getSolanaWallet();
  if (w) return w.publicKey.toBase58();
  const raw = (window as unknown as { solana?: { connect?: () => Promise<{ publicKey: { toBase58(): string } }> } }).solana;
  if (!raw?.connect) return null;
  const { publicKey } = await raw.connect();
  return publicKey.toBase58();
}

/**
 * Solana signer adapter for clawmate-sdk (Phantom).
 * getAddress() returns base58 pubkey; signMessage(bytes) returns base58 signature.
 */
export async function getSolanaSigner(): Promise<{ getAddress: () => Promise<string>; signMessage: (msg: Uint8Array) => Promise<{ signature: Uint8Array }> } | null> {
  const wallet = getSolanaWallet();
  if (!wallet) return null;
  const pk = wallet.publicKey;
  return {
    getAddress: async () => pk.toBase58(),
    signMessage: async (msg: Uint8Array) => {
      const res = await wallet.signMessage(msg);
      return { signature: res?.signature ?? new Uint8Array(0) };
    },
  };
}

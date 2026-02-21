/**
 * Browser wallet helpers so /chess uses the same logic as clawmate-sdk (platform).
 */
import { BrowserProvider, type Signer, type Provider } from "ethers";

export function getBrowserProvider(): Provider | null {
  if (typeof window === "undefined" || !window.ethereum) return null;
  return new BrowserProvider(window.ethereum);
}

export async function getBrowserSigner(): Promise<Signer | null> {
  const provider = getBrowserProvider();
  if (!provider) return null;
  return provider.getSigner();
}

import { keccak256, toBeHex, zeroPadValue } from "ethers";
import { DiceRoll } from "./types";

/**
 * Deterministic dice deriver using on-chain seed + turn number.
 * Same algorithm as keccak256(abi.encodePacked(seed, turnNumber)) in Solidity.
 * Produces two dice d1, d2 each in range [1, 6].
 */
export class DiceDeriver {
  private seed: string; // bytes32 hex string

  constructor(seed: string) {
    if (!seed.startsWith("0x") || seed.length !== 66) {
      throw new Error(`Invalid seed: must be bytes32 hex, got ${seed}`);
    }
    this.seed = seed.toLowerCase();
  }

  /**
   * Derive a dice roll for a given turn number.
   * Returns { d1, d2, sum, isDoubles }.
   */
  roll(turnNumber: number): DiceRoll {
    // Pack seed (bytes32) + turnNumber (uint256) = 64 bytes
    const turnHex = zeroPadValue(toBeHex(turnNumber), 32);
    const packed = this.seed + turnHex.slice(2); // remove 0x from turnHex
    const hash = keccak256(packed);

    // Use first 2 bytes of hash for dice
    const n = parseInt(hash.slice(2, 6), 16);
    const d1 = (n % 6) + 1;
    const d2 = (Math.floor(n / 6) % 6) + 1;
    const sum = d1 + d2;
    const isDoubles = d1 === d2;

    return { d1, d2, sum, isDoubles };
  }
}

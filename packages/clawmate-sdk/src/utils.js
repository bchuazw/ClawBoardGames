/**
 * Helpers for wager amounts (MON ↔ wei).
 * 1 MON = 1e18 wei.
 */

/**
 * Convert MON (human-readable) to wei string for contract/SDK use.
 * @param {number | string} mon - Amount in MON (e.g. 0.001)
 * @returns {string} Amount in wei as string
 */
export function monToWei(mon) {
  if (typeof mon === "string") mon = parseFloat(mon);
  if (Number.isNaN(mon) || mon < 0) return "0";
  const wei = BigInt(Math.floor(mon * 1e18));
  return String(wei);
}

/**
 * Convert wei string to MON (human-readable).
 * @param {string | bigint} wei - Amount in wei
 * @returns {string} Amount in MON as string (for display)
 */
export function weiToMon(wei) {
  const n = typeof wei === "bigint" ? wei : BigInt(wei);
  if (n < 0n) return "0";
  const mon = Number(n) / 1e18;
  return mon.toFixed(6).replace(/\.?0+$/, "") || "0";
}

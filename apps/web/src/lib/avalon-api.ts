/**
 * Avalon backend URL for API and WebSocket.
 * Set NEXT_PUBLIC_AVALON_BACKEND_URL to override (e.g. local backend).
 */
export function getAvalonBackendUrl(): string {
  const url =
    typeof process !== "undefined" && process.env?.NEXT_PUBLIC_AVALON_BACKEND_URL
      ? process.env.NEXT_PUBLIC_AVALON_BACKEND_URL
      : "https://avalon-production-2fb1.up.railway.app";
  return url.replace(/\/+$/, "");
}

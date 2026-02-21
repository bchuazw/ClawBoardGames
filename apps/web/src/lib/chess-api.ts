/**
 * Clawmate Chess API base URL and fetch helper.
 * Uses NEXT_PUBLIC_CLAWMATE_API_URL when set; otherwise localhost:4000 in dev.
 */
export function getApiUrl(): string {
  if (typeof window === "undefined") return "";
  const env = process.env.NEXT_PUBLIC_CLAWMATE_API_URL;
  if (env) return env;
  return process.env.NODE_ENV === "development" ? "http://localhost:4000" : window.location.origin;
}

export function api(path: string, options: RequestInit = {}): Promise<Response> {
  const base = getApiUrl();
  const url = path.startsWith("http") ? path : `${base}${path}`;
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
}

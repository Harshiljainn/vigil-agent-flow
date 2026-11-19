/**
 * Where the backend lives. The URL is not a secret.
 * Order: VITE_API_URL (override) > localhost backend when the site runs on localhost >
 * the deployed Render backend.
 */
export const LOCAL_API_URL = "http://localhost:8000";
export const PRODUCTION_API_URL = "https://vigilai-backend-yscq.onrender.com";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function pickApiUrl(override: string | undefined, hostname: string | undefined): string {
  const chosen =
    override ||
    (hostname === undefined || LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost")
      ? LOCAL_API_URL
      : PRODUCTION_API_URL);
  return chosen.replace(/\/+$/, "");
}

export const API_URL: string = pickApiUrl(
  import.meta.env["VITE_API_URL"] as string | undefined,
  typeof window === "undefined" ? undefined : window.location.hostname,
);

/** Render free sleeps after 15 min and needs about a minute to wake. */
export const WAKE_MAX_MS = 90_000;
/** Show the "waking up" message only if /health has not answered after this long. */
export const WAKE_NOTICE_MS = 2_000;
/** Retry interval for /health while waiting for the first answer. */
export const WAKE_RETRY_MS = 3_000;

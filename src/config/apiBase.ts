/**
 * Base URL HTTP/WS du backend Ecocompensation.
 *
 * En dev (`pnpm dev`) :
 * - par défaut → proxy Vite (`/api` → 127.0.0.1:8000), même origine, pas de CORS ;
 * - si `VITE_API_URL` est défini → appel direct (utiliser 127.0.0.1, pas localhost).
 *
 * Note : uvicorn sans `--host` n'écoute que sur 127.0.0.1 (IPv4).
 * `localhost` peut résoudre en ::1 (IPv6) → échec masqué en erreur CORS.
 */
const DEFAULT_BACKEND = "http://127.0.0.1:8000";

/** Remplace localhost par 127.0.0.1 pour éviter le piège IPv6. */
function normalizeBackendUrl(url: string): string {
  return url
    .replace(/^http:\/\/localhost\b/i, "http://127.0.0.1")
    .replace(/^https:\/\/localhost\b/i, "https://127.0.0.1")
    .replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    const explicit = import.meta.env.VITE_API_URL?.trim();
    if (!explicit) return "";
    return normalizeBackendUrl(explicit);
  }
  return normalizeBackendUrl(import.meta.env.VITE_API_URL?.trim() || DEFAULT_BACKEND);
}

export function getWsBaseUrl(): string {
  const base = getApiBaseUrl();
  if (!base && import.meta.env.DEV && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return normalizeBackendUrl(base || DEFAULT_BACKEND).replace(/^http/, "ws");
}

/** URL absolue pour un chemin `/api/...` (exports PDF, téléchargements). */
export function resolveApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBaseUrl();
  if (!base) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}${p}`;
    }
    return p;
  }
  return `${base}${p}`;
}

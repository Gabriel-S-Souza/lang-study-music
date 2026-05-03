function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

/**
 * Base da API no **browser**.
 * Sem `NEXT_PUBLIC_API_URL`: em `next dev`, ou com `NEXT_PUBLIC_RELATIVE_API=1` no build,
 * usa `''` e o Next encaminha `/api/*` ao FastAPI (mesma origem → ok com HTTPS/ngrok).
 */
export function getPublicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw && raw.length > 0) {
    return normalizeBaseUrl(raw);
  }
  const useRelativeBrowser =
    typeof window !== "undefined" &&
    (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_RELATIVE_API === "1");
  if (useRelativeBrowser) {
    return "";
  }
  return "http://127.0.0.1:8000";
}

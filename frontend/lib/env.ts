function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export function getPublicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw && raw.length > 0) {
    return normalizeBaseUrl(raw);
  }
  return "http://127.0.0.1:8000";
}

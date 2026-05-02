import { getPublicApiBaseUrl } from "@/lib/env";
import { isTranscriptResponse, type TranscriptResponse } from "@/types/transcript";

function extractFastApiDetail(json: unknown, status: number): string {
  if (json === null || typeof json !== "object") {
    return `Erro HTTP ${status}`;
  }
  const detail = (json as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "object" && item !== null && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  return `Erro HTTP ${status}`;
}

export class TranscriptFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TranscriptFetchError";
  }
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResponse> {
  const base = getPublicApiBaseUrl();
  const res = await fetch(`${base}/api/videos/${encodeURIComponent(videoId)}/transcript`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text.length > 0 ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new TranscriptFetchError("Resposta inválida do servidor.", res.status);
  }

  if (!res.ok) {
    const detail = extractFastApiDetail(json, res.status);
    throw new TranscriptFetchError(detail, res.status);
  }

  if (!isTranscriptResponse(json)) {
    throw new TranscriptFetchError("Formato de legenda inesperado.", res.status);
  }

  return json;
}

import { getPublicApiBaseUrl } from "@/lib/env";

const MAX_ITEMS_PER_REQUEST = 1200;

export interface BulkTranslateItem {
  readonly lineIndex: number;
  readonly text: string;
}

export interface BulkTranslateRequestBody {
  readonly videoId: string;
  readonly sourceLanguage?: string;
  readonly items: readonly BulkTranslateItem[];
}

export interface BulkTranslateLineDto {
  readonly lineIndex: number;
  readonly translatedText: string;
}

export interface BulkTranslateResponseDto {
  readonly translations: readonly BulkTranslateLineDto[];
}

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

function isBulkTranslateLineDto(v: unknown): v is BulkTranslateLineDto {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lineIndex === "number" &&
    Number.isFinite(o.lineIndex) &&
    typeof o.translatedText === "string"
  );
}

function isBulkTranslateResponseDto(v: unknown): v is BulkTranslateResponseDto {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.translations)) return false;
  return o.translations.every(isBulkTranslateLineDto);
}

export class BulkTranslateFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BulkTranslateFetchError";
  }
}

async function fetchBulkTranslateOnce(
  body: BulkTranslateRequestBody,
): Promise<BulkTranslateResponseDto> {
  const base = getPublicApiBaseUrl();
  const payload: Record<string, unknown> = {
    videoId: body.videoId,
    items: body.items,
  };
  const src = body.sourceLanguage?.trim();
  if (src !== undefined && src.length > 0) {
    payload.sourceLanguage = src;
  }
  const res = await fetch(`${base}/api/study/bulk-translate`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text.length > 0 ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new BulkTranslateFetchError("Resposta inválida do servidor.", res.status);
  }

  if (!res.ok) {
    throw new BulkTranslateFetchError(extractFastApiDetail(json, res.status), res.status);
  }

  if (!isBulkTranslateResponseDto(json)) {
    throw new BulkTranslateFetchError("Formato de resposta inesperado.", res.status);
  }

  return json;
}

/** Parte `items` em lotes de até 1200 e agrega as traduções (uma ação do utilizador). */
export async function fetchBulkTranslate(
  body: BulkTranslateRequestBody,
): Promise<BulkTranslateResponseDto> {
  const { videoId, sourceLanguage, items } = body;
  if (items.length === 0) {
    return { translations: [] };
  }
  if (items.length <= MAX_ITEMS_PER_REQUEST) {
    return fetchBulkTranslateOnce({ videoId, sourceLanguage, items });
  }

  const all: BulkTranslateLineDto[] = [];
  for (let i = 0; i < items.length; i += MAX_ITEMS_PER_REQUEST) {
    const chunk = items.slice(i, i + MAX_ITEMS_PER_REQUEST);
    const part = await fetchBulkTranslateOnce({ videoId, sourceLanguage, items: chunk });
    all.push(...part.translations);
  }
  return { translations: all };
}

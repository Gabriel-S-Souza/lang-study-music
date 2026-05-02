import { getPublicApiBaseUrl } from "@/lib/env";

export type StudyChatRole = "user" | "model";

export interface StudyChatMessage {
  readonly role: StudyChatRole;
  readonly content: string;
}

export interface PhraseChatRequestBody {
  readonly modelId: string;
  readonly videoId: string;
  readonly lineIndex: number;
  readonly lineText: string;
  readonly messages: readonly StudyChatMessage[];
}

export interface ReusableChunkDto {
  readonly phraseEn: string;
  readonly explanationPt: string;
}

export interface PhraseChatResponseDto {
  readonly fallback: boolean;
  readonly suggestedTranslationPt: string | null;
  readonly grammarTopics: string[] | null;
  readonly reusableChunks: ReusableChunkDto[] | null;
  readonly explanation: string | null;
  readonly assistantMessage: string;
  readonly rawAssistantText: string | null;
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

function isReusableChunkDto(v: unknown): v is ReusableChunkDto {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.phraseEn === "string" && typeof o.explanationPt === "string";
}

function isPhraseChatResponseDto(v: unknown): v is PhraseChatResponseDto {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.fallback !== "boolean" || typeof o.assistantMessage !== "string") {
    return false;
  }
  if (o.suggestedTranslationPt !== null && typeof o.suggestedTranslationPt !== "string") {
    return false;
  }
  if (o.explanation !== null && typeof o.explanation !== "string") return false;
  if (o.rawAssistantText !== null && typeof o.rawAssistantText !== "string") return false;
  if (o.grammarTopics !== null) {
    if (!Array.isArray(o.grammarTopics) || !o.grammarTopics.every((x) => typeof x === "string")) {
      return false;
    }
  }
  if (o.reusableChunks !== null) {
    if (!Array.isArray(o.reusableChunks) || !o.reusableChunks.every(isReusableChunkDto)) {
      return false;
    }
  }
  return true;
}

export class PhraseChatFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PhraseChatFetchError";
  }
}

export async function fetchPhraseChat(body: PhraseChatRequestBody): Promise<PhraseChatResponseDto> {
  const base = getPublicApiBaseUrl();
  const res = await fetch(`${base}/api/study/phrase-chat`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text.length > 0 ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new PhraseChatFetchError("Resposta inválida do servidor.", res.status);
  }

  if (!res.ok) {
    throw new PhraseChatFetchError(extractFastApiDetail(json, res.status), res.status);
  }

  if (!isPhraseChatResponseDto(json)) {
    throw new PhraseChatFetchError("Formato de resposta inesperado.", res.status);
  }

  return json;
}

/** Texto do primeiro turno alinhado ao backend para o histórico de continuação. */
export function buildOpeningUserContentForHistory(lineText: string): string {
  return `Frase em inglês (legenda, uma linha):\n\n${lineText}\n\nAnalise para o meu aprendizado e preencha o JSON conforme as instruções do sistema.`;
}

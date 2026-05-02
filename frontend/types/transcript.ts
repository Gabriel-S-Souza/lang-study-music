export interface TranscriptLine {
  readonly text: string;
  readonly start: number;
  readonly duration: number;
}

export interface TranscriptResponse {
  readonly videoId: string;
  readonly language: string;
  readonly languageCode: string;
  readonly isGenerated: boolean;
  readonly lines: readonly TranscriptLine[];
}

export function isTranscriptResponse(value: unknown): value is TranscriptResponse {
  if (value === null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.videoId !== "string") return false;
  if (!Array.isArray(o.lines)) return false;
  return o.lines.every((line) => {
    if (line === null || typeof line !== "object") return false;
    const l = line as Record<string, unknown>;
    return (
      typeof l.text === "string" &&
      typeof l.start === "number" &&
      typeof l.duration === "number"
    );
  });
}

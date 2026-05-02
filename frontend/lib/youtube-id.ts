const ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const URL_PATTERNS: RegExp[] = [
  /(?:youtube\.com\/watch\?[^#]*\bv=)([a-zA-Z0-9_-]{11})\b/,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})\b/,
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})\b/,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})\b/,
];

/**
 * Accepts a bare 11-char id or common YouTube URL shapes.
 */
export function parseYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (ID_REGEX.test(trimmed)) return trimmed;
  for (const re of URL_PATTERNS) {
    const m = trimmed.match(re);
    if (m?.[1] && ID_REGEX.test(m[1])) return m[1];
  }
  return null;
}

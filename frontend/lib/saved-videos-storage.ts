import { parseYoutubeVideoId } from "@/lib/youtube-id";

const STORAGE_KEY = "english-study-music:saved-videos:v1";

export interface SavedVideoEntry {
  readonly videoId: string;
  /** Texto colado pelo usuário (URL ou ID) para exibição. */
  readonly inputUrl: string;
  readonly savedAt: string;
}

type RawList = SavedVideoEntry[];

function readList(): RawList {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SavedVideoEntry[] = [];
    for (const item of parsed) {
      if (item === null || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (
        typeof o.videoId === "string" &&
        typeof o.inputUrl === "string" &&
        typeof o.savedAt === "string"
      ) {
        out.push({
          videoId: o.videoId,
          inputUrl: o.inputUrl,
          savedAt: o.savedAt,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function writeList(list: RawList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function listSavedVideos(): SavedVideoEntry[] {
  const list = readList();
  const seen = new Set<string>();
  const deduped: SavedVideoEntry[] = [];
  for (const e of list) {
    if (seen.has(e.videoId)) continue;
    seen.add(e.videoId);
    deduped.push(e);
  }
  return deduped.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function isVideoSaved(videoId: string): boolean {
  return readList().some((e) => e.videoId === videoId);
}

/**
 * Adiciona ou atualiza (move para o topo lógico com novo `savedAt`) pelo `videoId` deduplicado.
 */
export function addSavedVideo(rawInput: string): SavedVideoEntry | null {
  const trimmed = rawInput.trim();
  const videoId = parseYoutubeVideoId(trimmed);
  if (videoId === null) return null;

  const list = readList().filter((e) => e.videoId !== videoId);
  const entry: SavedVideoEntry = {
    videoId,
    inputUrl: trimmed.length > 0 ? trimmed : videoId,
    savedAt: new Date().toISOString(),
  };
  list.unshift(entry);
  writeList(list);
  return entry;
}

export function removeSavedVideo(videoId: string): void {
  writeList(readList().filter((e) => e.videoId !== videoId));
}

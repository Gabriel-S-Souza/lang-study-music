import type { TranscriptLine } from "@/types/transcript";

const STORAGE_KEY = "english-study-music:translations:v1";

type RawStore = Record<string, Record<string, string>>;

function readStore(): RawStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    return parsed as RawStore;
  } catch {
    return {};
  }
}

function writeStore(store: RawStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function loadTranslationsForVideo(videoId: string): Record<number, string> {
  const store = readStore();
  const bucket = store[videoId];
  if (!bucket) return {};
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(bucket)) {
    const idx = Number.parseInt(k, 10);
    if (!Number.isFinite(idx)) continue;
    if (typeof v === "string") out[idx] = v;
  }
  return out;
}

export function persistTranslation(
  videoId: string,
  lineIndex: number,
  text: string,
): void {
  const store = readStore();
  const bucket: Record<string, string> = { ...(store[videoId] ?? {}) };
  const key = String(lineIndex);
  if (text.trim().length === 0) {
    delete bucket[key];
  } else {
    bucket[key] = text;
  }
  if (Object.keys(bucket).length === 0) {
    const nextStore: RawStore = { ...store };
    delete nextStore[videoId];
    writeStore(nextStore);
    return;
  }
  writeStore({ ...store, [videoId]: bucket });
}

/** Mescla várias linhas num único `setItem` (ex.: tradução em lote). */
export function persistTranslationsForVideo(
  videoId: string,
  updates: Readonly<Record<number, string>>,
): void {
  const store = readStore();
  const bucket: Record<string, string> = { ...(store[videoId] ?? {}) };
  for (const [k, text] of Object.entries(updates)) {
    const idx = Number.parseInt(k, 10);
    if (!Number.isFinite(idx)) continue;
    const key = String(idx);
    if (text.trim().length === 0) {
      delete bucket[key];
    } else {
      bucket[key] = text;
    }
  }
  if (Object.keys(bucket).length === 0) {
    const nextStore: RawStore = { ...store };
    delete nextStore[videoId];
    writeStore(nextStore);
    return;
  }
  writeStore({ ...store, [videoId]: bucket });
}

export function buildInitialTranslationState(
  videoId: string,
  lines: readonly TranscriptLine[],
): Record<number, string> {
  const fromDisk = loadTranslationsForVideo(videoId);
  const next: Record<number, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const v = fromDisk[i];
    if (typeof v === "string") next[i] = v;
  }
  return next;
}

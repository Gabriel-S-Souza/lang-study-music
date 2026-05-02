const STORAGE_KEY = "english-study-music:gemini-model:v1";

/** IDs aceitos pelo backend (defaults; podem ser sobrescritos por env no servidor). */
export const GEMINI_MODEL_FLASH = "gemini-3-flash-preview";
export const GEMINI_MODEL_FLASH_LITE = "gemini-3.1-flash-lite-preview";

export const GEMINI_MODEL_OPTIONS: readonly { readonly id: string; readonly label: string }[] = [
  { id: GEMINI_MODEL_FLASH, label: "Gemini 3 Flash" },
  { id: GEMINI_MODEL_FLASH_LITE, label: "Gemini 3.1 Flash-Lite" },
] as const;

export function getStoredGeminiModelId(): string {
  if (typeof window === "undefined") return GEMINI_MODEL_FLASH;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)?.trim();
    if (raw && GEMINI_MODEL_OPTIONS.some((o) => o.id === raw)) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return GEMINI_MODEL_FLASH;
}

export function setStoredGeminiModelId(modelId: string): void {
  if (typeof window === "undefined") return;
  if (!GEMINI_MODEL_OPTIONS.some((o) => o.id === modelId)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, modelId);
  } catch {
    /* ignore */
  }
}

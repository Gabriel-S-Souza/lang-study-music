"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

import { LyricsPanel } from "@/components/LyricsPanel";
import { PhraseAssistantDrawer } from "@/components/PhraseAssistantDrawer";
import { TranscriptFetchError, fetchTranscript } from "@/lib/fetch-transcript";
import {
  buildInitialTranslationState,
  persistTranslation,
} from "@/lib/translations-storage";
import { parseYoutubeVideoId } from "@/lib/youtube-id";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  useVideoProgressMonitor,
  type AbLoopWindow,
  type VideoProgressPayload,
} from "@/hooks/useVideoProgressMonitor";
import { useYoutubeIframeApiReady } from "@/hooks/useYoutubeIframeApiReady";
import { useYoutubeStudyPlayer } from "@/hooks/useYoutubeStudyPlayer";
import type { TranscriptResponse } from "@/types/transcript";
import {
  addSavedVideo,
  isVideoSaved,
  removeSavedVideo,
} from "@/lib/saved-videos-storage";
import {
  GEMINI_MODEL_FLASH,
  getStoredGeminiModelId,
  setStoredGeminiModelId,
} from "@/lib/gemini-model-storage";

export interface StudyWorkspaceProps {
  /** Se definido, preenche e tenta carregar legendas ao montar/atualizar. */
  readonly initialVideoId?: string | null;
  /** Mostra link para a biblioteca (`/`). */
  readonly showLibraryLink?: boolean;
}

export function StudyWorkspace({
  initialVideoId = null,
  showLibraryLink = false,
}: StudyWorkspaceProps): ReactElement {
  const [urlOrIdInput, setUrlOrIdInput] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [abLoop, setAbLoop] = useState<AbLoopWindow | null>(null);
  const [abLoopLineIndex, setAbLoopLineIndex] = useState<number | null>(null);
  /** Linha em edição: input abre ao clicar no verso (junto com seek + loop A–B). */
  const [notesLineIndex, setNotesLineIndex] = useState<number | null>(null);
  const [savedInLibrary, setSavedInLibrary] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantCtx, setAssistantCtx] = useState<{
    lineIndex: number;
    lineText: string;
  } | null>(null);
  const [geminiModelId, setGeminiModelId] = useState(GEMINI_MODEL_FLASH);

  const apiReady = useYoutubeIframeApiReady();
  const { mountRef, player, playerReady } = useYoutubeStudyPlayer(apiReady, videoId);

  const debouncedPersist = useDebouncedCallback(
    (vid: string, lineIndex: number, text: string) => {
      persistTranslation(vid, lineIndex, text);
    },
    320,
  );

  const handleTranslationChange = useCallback(
    (lineIndex: number, value: string): void => {
      setTranslations((prev) => ({ ...prev, [lineIndex]: value }));
      if (videoId !== null) {
        debouncedPersist(videoId, lineIndex, value);
      }
    },
    [debouncedPersist, videoId],
  );

  const handleProgress = useCallback((payload: VideoProgressPayload): void => {
    setActiveLineIndex((prev) =>
      prev === payload.activeLineIndex ? prev : payload.activeLineIndex,
    );
  }, []);

  const lines = transcript?.lines ?? null;
  useVideoProgressMonitor(player, lines, abLoop, handleProgress);

  const transcriptMeta = useMemo(() => {
    if (transcript === null) return null;
    return `${transcript.language} (${transcript.languageCode})${
      transcript.isGenerated ? " · gerada automaticamente" : ""
    }`;
  }, [transcript]);

  const loadTranscriptForRawInput = useCallback(async (raw: string): Promise<void> => {
    setLoadError(null);
    const id = parseYoutubeVideoId(raw);
    if (id === null) {
      setLoadError("Cole uma URL válida do YouTube ou o ID de 11 caracteres.");
      return;
    }
    setUrlOrIdInput(raw.trim());
    setLoadingTranscript(true);
    setAbLoop(null);
    setAbLoopLineIndex(null);
    setNotesLineIndex(null);
    try {
      const data = await fetchTranscript(id);
      setVideoId(id);
      setTranscript(data);
      setTranslations(buildInitialTranslationState(id, data.lines));
    } catch (err) {
      setVideoId(null);
      setTranscript(null);
      setTranslations({});
      if (err instanceof TranscriptFetchError) {
        setLoadError(err.message);
      } else {
        setLoadError("Falha ao carregar legendas.");
      }
    } finally {
      setLoadingTranscript(false);
    }
  }, []);

  const handleLoadTranscript = useCallback(async (): Promise<void> => {
    await loadTranscriptForRawInput(urlOrIdInput);
  }, [loadTranscriptForRawInput, urlOrIdInput]);

  useEffect(() => {
    if (initialVideoId === null || initialVideoId === "") return;
    const id = parseYoutubeVideoId(initialVideoId);
    if (id === null) return;
    void loadTranscriptForRawInput(initialVideoId.trim().length > 0 ? initialVideoId.trim() : id);
  }, [initialVideoId, loadTranscriptForRawInput]);

  useEffect(() => {
    if (videoId === null) {
      setSavedInLibrary(false);
      return;
    }
    setSavedInLibrary(isVideoSaved(videoId));
  }, [videoId]);

  useEffect(() => {
    setGeminiModelId(getStoredGeminiModelId());
  }, []);

  useEffect(() => {
    if (videoId === null || transcript === null) {
      setAssistantOpen(false);
      setAssistantCtx(null);
    }
  }, [videoId, transcript]);

  const handleLineActivate = useCallback(
    (lineIndex: number): void => {
      if (transcript === null || player === null) return;
      const line = transcript.lines[lineIndex];
      if (!line) return;
      player.seekTo(line.start, true);
      setAbLoop({
        startSeconds: line.start,
        endSeconds: line.start + line.duration,
      });
      setAbLoopLineIndex(lineIndex);
      setNotesLineIndex(lineIndex);
    },
    [player, transcript],
  );

  const handleTranslationEditEnd = useCallback((): void => {
    setNotesLineIndex(null);
  }, []);

  const handleOpenAssistant = useCallback(
    (lineIndex: number): void => {
      if (transcript === null) return;
      const line = transcript.lines[lineIndex];
      if (!line) return;
      setAssistantCtx({ lineIndex, lineText: line.text });
      setAssistantOpen(true);
    },
    [transcript],
  );

  const handleCloseAssistant = useCallback((): void => {
    setAssistantOpen(false);
    setAssistantCtx(null);
  }, []);

  const handleGeminiModelChange = useCallback((id: string): void => {
    setGeminiModelId(id);
    setStoredGeminiModelId(id);
  }, []);

  const handleAcceptAssistantTranslation = useCallback(
    (text: string): void => {
      if (assistantCtx === null) return;
      handleTranslationChange(assistantCtx.lineIndex, text);
    },
    [assistantCtx, handleTranslationChange],
  );

  const handleClearLoop = useCallback((): void => {
    setAbLoop(null);
    setAbLoopLineIndex(null);
    setNotesLineIndex(null);
  }, []);

  const handleSaveToLibrary = useCallback((): void => {
    if (videoId === null) return;
    const raw = urlOrIdInput.trim().length > 0 ? urlOrIdInput.trim() : videoId;
    addSavedVideo(raw);
    setSavedInLibrary(true);
  }, [urlOrIdInput, videoId]);

  const handleRemoveFromLibrary = useCallback((): void => {
    if (videoId === null) return;
    removeSavedVideo(videoId);
    setSavedInLibrary(false);
  }, [videoId]);

  return (
    <div className="min-h-screen bg-[#121212] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#121212]/95 px-2 py-3 backdrop-blur-md sm:px-3 lg:px-4">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            {showLibraryLink ? (
              <Link
                href="/"
                className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 sm:text-sm"
              >
                Biblioteca
              </Link>
            ) : null}
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                English + música
              </h1>
              <p className="text-xs text-zinc-500 sm:text-sm">
                Listening com legendas, tradução e loop por verso.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-center">
            <input
              type="text"
              value={urlOrIdInput}
              onChange={(e): void => {
                setUrlOrIdInput(e.target.value);
              }}
              placeholder="URL ou ID do vídeo"
              className="min-h-11 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
            <button
              type="button"
              onClick={(): void => {
                void handleLoadTranscript();
              }}
              disabled={loadingTranscript}
              className="min-h-11 shrink-0 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingTranscript ? "Carregando…" : "Carregar legendas"}
            </button>
          </div>
        </div>
        {loadError !== null ? (
          <p className="mx-auto mt-2 w-full max-w-[1800px] px-2 text-sm text-red-400 sm:px-3">{loadError}</p>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-[1800px] px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6">
        {videoId === null || transcript === null ? (
          <p className="mt-8 text-center text-sm text-zinc-500">
            Cole o link de uma música no YouTube e carregue as legendas em inglês para começar.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.28fr)_minmax(0,1fr)] lg:gap-6 xl:gap-8">
            <section className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                <div ref={mountRef} className="h-full w-full" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 sm:text-sm">
                <span className="truncate font-mono text-zinc-400">ID: {videoId}</span>
                <span className={playerReady ? "text-emerald-400" : "text-amber-400"}>
                  {playerReady ? "Player pronto" : "Player carregando…"}
                </span>
              </div>
              {transcriptMeta !== null ? (
                <p className="text-xs text-zinc-500 sm:text-sm">{transcriptMeta}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleClearLoop}
                  disabled={abLoop === null}
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
                >
                  Sair do loop A–B
                </button>
                {savedInLibrary ? (
                  <button
                    type="button"
                    onClick={handleRemoveFromLibrary}
                    className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 transition hover:bg-white/10 sm:text-sm"
                  >
                    Remover da biblioteca
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveToLibrary}
                    className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/25 sm:text-sm"
                  >
                    Salvar na biblioteca
                  </button>
                )}
              </div>
            </section>

            <section className="flex min-h-[50vh] max-h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-900/80 to-[#0a0a0a] ring-1 ring-white/5 sm:max-h-[calc(100dvh-10rem)] lg:max-h-[calc(100dvh-6.5rem)]">
              <LyricsPanel
                lines={transcript.lines}
                activeLineIndex={activeLineIndex}
                abLoopLineIndex={abLoopLineIndex}
                translationEditorLineIndex={notesLineIndex}
                translations={translations}
                onTranslationChange={handleTranslationChange}
                onTranslationEditEnd={handleTranslationEditEnd}
                onLineActivate={handleLineActivate}
                onOpenAssistant={handleOpenAssistant}
              />
            </section>
          </div>
        )}
      </main>
      {assistantOpen && videoId !== null && assistantCtx !== null ? (
        <PhraseAssistantDrawer
          open={assistantOpen}
          onClose={handleCloseAssistant}
          videoId={videoId}
          lineIndex={assistantCtx.lineIndex}
          lineText={assistantCtx.lineText}
          modelId={geminiModelId}
          onModelChange={handleGeminiModelChange}
          onAcceptTranslation={handleAcceptAssistantTranslation}
        />
      ) : null}
    </div>
  );
}

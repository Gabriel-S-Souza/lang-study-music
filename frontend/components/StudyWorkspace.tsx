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
import { readYoutubePlayerTitle } from "@/lib/read-youtube-player-title";
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

/** Velocidades oferecidas pelo app (API do YouTube aceita estes valores na maioria dos vídeos). */
const STUDY_PLAYBACK_RATES = [0.5, 0.75, 1] as const;
type StudyPlaybackRate = (typeof STUDY_PLAYBACK_RATES)[number];

function playbackRateShortLabel(rate: StudyPlaybackRate): string {
  return rate.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: rate % 1 === 0 ? 0 : 2,
  });
}

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
    videoTitle?: string;
  } | null>(null);
  const [geminiModelId, setGeminiModelId] = useState(GEMINI_MODEL_FLASH);
  const [playbackRate, setPlaybackRate] = useState<StudyPlaybackRate>(1);

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

  useEffect(() => {
    if (player === null || !playerReady) return;
    try {
      player.setPlaybackRate(playbackRate);
    } catch {
      /* noop */
    }
  }, [player, playerReady, playbackRate]);

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
      const fromPlayer = readYoutubePlayerTitle(player);
      setAssistantCtx(
        fromPlayer !== null
          ? { lineIndex, lineText: line.text, videoTitle: fromPlayer }
          : { lineIndex, lineText: line.text },
      );
      setAssistantOpen(true);
    },
    [player, transcript],
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

  const studyLayoutActive = videoId !== null && transcript !== null;

  return (
    <div
      className={
        studyLayoutActive
          ? "flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#121212] text-zinc-100 lg:max-h-none lg:h-auto lg:min-h-screen lg:overflow-visible"
          : "min-h-screen bg-[#121212] text-zinc-100"
      }
    >
      <header className="sticky top-0 z-20 shrink-0 border-b border-white/10 bg-[#121212]/95 px-2 py-3 backdrop-blur-md sm:px-3 lg:px-4">
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
          <div className="hidden w-full flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-center lg:flex">
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

      <main
        className={
          studyLayoutActive
            ? "mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3 lg:block lg:flex-none lg:px-4 lg:py-6"
            : "mx-auto w-full max-w-[1800px] px-2 py-4 sm:px-3 sm:py-5 lg:px-4 lg:py-6"
        }
      >
        {studyLayoutActive ? (
          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-white/5 pb-1.5 lg:hidden">
            <span className="min-w-0 truncate font-mono text-[10px] text-zinc-500" title={videoId ?? undefined}>
              {videoId}
            </span>
            <span className={playerReady ? "shrink-0 text-[10px] text-emerald-400" : "shrink-0 text-[10px] text-amber-400"}>
              {playerReady ? "Pronto" : "Carregando…"}
            </span>
          </div>
        ) : null}
        {videoId === null || transcript === null ? (
          <p className="mt-8 max-w-md px-2 text-center text-sm text-zinc-500 lg:max-w-none lg:px-0">
            <span className="lg:hidden">
              Para estudar outra música, volte à{" "}
              <Link href="/" className="font-medium text-emerald-400/95 underline-offset-2 hover:underline">
                biblioteca
              </Link>{" "}
              ou use um link com <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs">?v=</code> do
              YouTube. Em telas grandes você pode colar a URL no topo.
            </span>
            <span className="hidden lg:inline">
              Cole o link de uma música no YouTube e carregue as legendas em inglês para começar.
            </span>
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:flex-none lg:min-h-0 lg:grid-cols-[minmax(0,1.28fr)_minmax(0,1fr)] lg:gap-6 xl:gap-8">
            <section className="flex shrink-0 flex-col gap-2 lg:sticky lg:top-24 lg:self-start">
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                <div ref={mountRef} className="h-full w-full" />
              </div>
              <div className="hidden flex-wrap items-center justify-between gap-1.5 text-[10px] text-zinc-500 sm:text-xs lg:flex">
                <span className="min-w-0 truncate font-mono text-zinc-400">ID: {videoId}</span>
                <span className={playerReady ? "shrink-0 text-emerald-400" : "shrink-0 text-amber-400"}>
                  {playerReady ? "Pronto" : "Carregando…"}
                </span>
              </div>
              {transcriptMeta !== null ? (
                <p className="text-[10px] text-zinc-500 sm:text-xs">{transcriptMeta}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                <div
                  className="inline-flex shrink-0 rounded-md border border-white/15 bg-black/40 p-px"
                  title="Velocidade de reprodução"
                >
                  {STUDY_PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      disabled={!playerReady}
                      aria-label={`Velocidade ${playbackRateShortLabel(rate)}×`}
                      onClick={(): void => {
                        setPlaybackRate(rate);
                      }}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none transition sm:px-2 sm:py-1 sm:text-xs ${
                        playbackRate === rate
                          ? "bg-white/15 text-white"
                          : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {playbackRateShortLabel(rate)}×
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleClearLoop}
                  disabled={abLoop === null}
                  aria-label="Sair do loop A–B"
                  title="Sair do loop A–B"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/15 text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                    aria-hidden
                  >
                    <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.001 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                </button>
                {savedInLibrary ? (
                  <button
                    type="button"
                    onClick={handleRemoveFromLibrary}
                    aria-label="Remover da biblioteca"
                    title="Remover da biblioteca"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/15 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-300 sm:h-8 sm:w-8"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                      aria-hidden
                    >
                      <path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveToLibrary}
                    aria-label="Salvar na biblioteca"
                    title="Salvar na biblioteca"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 transition hover:bg-emerald-500/20 sm:h-8 sm:w-8"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                      aria-hidden
                    >
                      <path d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                  </button>
                )}
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-900/80 to-[#0a0a0a] ring-1 ring-white/5 lg:max-h-[calc(100dvh-6.5rem)] lg:min-h-[50vh] lg:flex-none">
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
          videoTitle={assistantCtx.videoTitle}
          modelId={geminiModelId}
          onModelChange={handleGeminiModelChange}
          onAcceptTranslation={handleAcceptAssistantTranslation}
        />
      ) : null}
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { GEMINI_MODEL_OPTIONS } from "@/lib/gemini-model-storage";
import {
  PhraseChatFetchError,
  buildOpeningUserContentForHistory,
  fetchPhraseChat,
  type PhraseChatResponseDto,
  type StudyChatMessage,
} from "@/lib/study-chat-api";

export interface PhraseAssistantDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly videoId: string;
  readonly lineIndex: number;
  readonly lineText: string;
  /** Título do vídeo (iframe); omitir se desconhecido. */
  readonly videoTitle?: string;
  readonly modelId: string;
  readonly onModelChange: (modelId: string) => void;
  readonly onAcceptTranslation: (translation: string) => void;
}

function SimpleMarkdownish({ text }: { readonly text: string }): ReactElement {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

export function PhraseAssistantDrawer({
  open,
  onClose,
  videoId,
  lineIndex,
  lineText,
  videoTitle,
  modelId,
  onModelChange,
  onAcceptTranslation,
}: PhraseAssistantDrawerProps): ReactNode {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StudyChatMessage[]>([]);
  const [openingMeta, setOpeningMeta] = useState<PhraseChatResponseDto | null>(null);
  const [draft, setDraft] = useState("");
  const requestSeq = useRef(0);
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const runOpening = useCallback(async (): Promise<void> => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    setHistory([]);
    setOpeningMeta(null);
    try {
      const data = await fetchPhraseChat({
        modelId: modelIdRef.current,
        videoId,
        lineIndex,
        lineText,
        messages: [],
        ...(videoTitle !== undefined && videoTitle.trim().length > 0
          ? { videoTitle: videoTitle.trim() }
          : {}),
      });
      if (seq !== requestSeq.current) return;
      const openingUser = buildOpeningUserContentForHistory(lineText, videoTitle);
      setHistory([
        { role: "user", content: openingUser },
        { role: "model", content: data.assistantMessage },
      ]);
      setOpeningMeta(data);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      const msg =
        e instanceof PhraseChatFetchError ? e.message : "Falha ao carregar o assistente.";
      setError(msg);
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  }, [lineIndex, lineText, videoId, videoTitle]);

  useEffect(() => {
    if (!open) return;
    void runOpening();
  }, [open, runOpening]);

  const handleSend = useCallback(async (): Promise<void> => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || loading || sending) return;
    const seq = ++requestSeq.current;
    const nextHistory: StudyChatMessage[] = [...history, { role: "user", content: trimmed }];
    setHistory(nextHistory);
    setDraft("");
    setSending(true);
    setError(null);
    try {
      const data = await fetchPhraseChat({
        modelId: modelIdRef.current,
        videoId,
        lineIndex,
        lineText,
        messages: nextHistory,
      });
      if (seq !== requestSeq.current) return;
      setHistory((h) => [...h, { role: "model", content: data.assistantMessage }]);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      const msg =
        e instanceof PhraseChatFetchError ? e.message : "Falha ao enviar mensagem.";
      setError(msg);
      setHistory((h) => h.slice(0, -1));
      setDraft(trimmed);
    } finally {
      if (seq === requestSeq.current) {
        setSending(false);
      }
    }
  }, [draft, history, lineIndex, lineText, loading, sending, videoId]);

  const suggested = openingMeta?.suggestedTranslationPt?.trim() ?? "";

  const displayHistory =
    openingMeta !== null && !openingMeta.fallback && history.length >= 2
      ? history.slice(2)
      : history;

  /** Mostra o início da última resposta do modelo (abertura em cards ou última bolha no chat). */
  useLayoutEffect(() => {
    if (!open) return;
    if (loading || sending) return;
    const root = scrollAreaRef.current;
    if (root === null) return;

    const listed =
      openingMeta !== null && !openingMeta.fallback && history.length >= 2
        ? history.slice(2)
        : history;

    const openingPanel = root.querySelector("[data-opening-panel]");
    const noListedModelBubbles =
      openingMeta !== null &&
      !openingMeta.fallback &&
      listed.length === 0 &&
      openingPanel !== null;

    if (noListedModelBubbles) {
      openingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const modelLis = root.querySelectorAll('li[data-chat-role="model"]');
    const lastModel = modelLis[modelLis.length - 1];
    if (lastModel instanceof HTMLElement) {
      lastModel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [open, loading, sending, openingMeta, history]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Fechar assistente"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#141414] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="phrase-assistant-title"
      >
        <header className="shrink-0 border-b border-white/10 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="phrase-assistant-title" className="text-sm font-semibold text-white">
                Assistente de estudo
              </h2>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{lineText}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-white/15 px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/10"
            >
              Fechar
            </button>
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500">
              Modelo
            </span>
            <select
              value={modelId}
              onChange={(e): void => {
                onModelChange(e.target.value);
              }}
              className="w-full rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-xs text-zinc-200 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            >
              {GEMINI_MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div
          ref={scrollAreaRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {error !== null ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-500">Gerando análise…</p>
          ) : null}

          {!loading && openingMeta !== null && !openingMeta.fallback ? (
            <div
              data-opening-panel=""
              className="mb-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
            >
              {openingMeta.grammarTopics !== null && openingMeta.grammarTopics.length > 0 ? (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500">
                    Tópicos (inglês)
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {openingMeta.grammarTopics.map((t) => (
                      <li
                        key={t}
                        className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.7rem] font-medium text-emerald-200/90"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {openingMeta.explanation !== null && openingMeta.explanation.trim().length > 0 ? (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500">
                    Explicação
                  </p>
                  <div className="mt-1">
                    <SimpleMarkdownish text={openingMeta.explanation} />
                  </div>
                </div>
              ) : null}
              {openingMeta.reusableChunks !== null && openingMeta.reusableChunks.length > 0 ? (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500">
                    Pedaços reutilizáveis
                  </p>
                  <ul className="mt-1 space-y-1.5 text-xs text-zinc-300">
                    {openingMeta.reusableChunks.map((c) => (
                      <li key={`${c.phraseEn}-${c.explanationPt}`}>
                        <span className="font-medium text-white">{c.phraseEn}</span>
                        <span className="text-zinc-500"> — </span>
                        {c.explanationPt}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {!loading && openingMeta?.fallback === true ? (
            <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/95">
              Modo fallback: só tradução automática (Cloud Translation).
            </p>
          ) : null}

          <ul className="space-y-4">
            {displayHistory.map((m, idx) => (
              <li
                key={`${idx}-${m.role}-${m.content.slice(0, 24)}`}
                data-chat-role={m.role}
                className={m.role === "user" ? "text-right" : "text-left"}
              >
                <div
                  className={[
                    "inline-block max-w-[95%] rounded-xl px-3 py-2 text-left text-sm",
                    m.role === "user"
                      ? "bg-emerald-500/20 text-emerald-50"
                      : "bg-zinc-800/90 text-zinc-100 ring-1 ring-white/10",
                  ].join(" ")}
                >
                  {m.role === "model" ? (
                    <SimpleMarkdownish text={m.content} />
                  ) : (
                    <p className="whitespace-pre-wrap text-left text-sm leading-relaxed">{m.content}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="shrink-0 border-t border-white/10 bg-[#121212] px-4 py-3">
          {suggested.length > 0 ? (
            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500">
                Tradução sugerida
              </p>
              <p className="text-sm text-zinc-100">{suggested}</p>
              <button
                type="button"
                onClick={(): void => {
                  onAcceptTranslation(suggested);
                  onClose();
                }}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black transition hover:bg-emerald-400"
              >
                Usar no campo de anotação
              </button>
            </div>
          ) : null}
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e): void => {
                setDraft(e.target.value);
              }}
              onKeyDown={(e): void => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={loading || sending}
              placeholder="Pergunte algo sobre a frase…"
              className="min-h-10 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={loading || sending || draft.trim().length === 0}
              onClick={(): void => {
                void handleSend();
              }}
              className="shrink-0 rounded-lg bg-zinc-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? "…" : "Enviar"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

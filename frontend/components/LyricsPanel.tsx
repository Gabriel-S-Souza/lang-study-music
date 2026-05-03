"use client";

import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactElement } from "react";

import type { TranscriptLine } from "@/types/transcript";

export interface LyricsPanelProps {
  readonly lines: readonly TranscriptLine[];
  readonly activeLineIndex: number;
  readonly abLoopLineIndex: number | null;
  /** Linha cujo input está aberto (mesmo índice do clique no verso principal). */
  readonly translationEditorLineIndex: number | null;
  readonly translations: Readonly<Record<number, string>>;
  readonly onTranslationChange: (lineIndex: number, value: string) => void;
  readonly onTranslationEditEnd: () => void;
  readonly onLineActivate: (lineIndex: number) => void;
  readonly onOpenAssistant?: (lineIndex: number) => void;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function computeScrollTopToCenterRow(scrollRoot: HTMLDivElement, row: HTMLDivElement): number {
  const rootRect = scrollRoot.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const rowCenterY = rowRect.top + rowRect.height / 2;
  const rootCenterY = rootRect.top + rootRect.height / 2;
  const delta = rowCenterY - rootCenterY;
  const raw = scrollRoot.scrollTop + delta;
  const maxScroll = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  return Math.max(0, Math.min(maxScroll, raw));
}

/**
 * Anima `scrollTop` com easing; cancela animação anterior no mesmo root.
 */
function runSmoothScrollTo(
  scrollRoot: HTMLDivElement,
  targetScrollTop: number,
  rafRef: { current: number | null },
  durationMs: number,
): void {
  if (rafRef.current !== null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  const from = scrollRoot.scrollTop;
  const delta = targetScrollTop - from;
  if (Math.abs(delta) < 1.5) {
    return;
  }

  /** 25% mais rápido que o baseline anterior (280–780 ms no cálculo bruto). */
  const k = 0.75;
  const duration = Math.min(780 * k, Math.max(280 * k, durationMs * k));

  let startTime: number | null = null;

  const step = (now: number): void => {
    if (startTime === null) {
      startTime = now;
    }
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(t);
    if (t < 1) {
      scrollRoot.scrollTop = from + delta * eased;
      rafRef.current = requestAnimationFrame(step);
    } else {
      scrollRoot.scrollTop = targetScrollTop;
      rafRef.current = null;
    }
  };

  rafRef.current = requestAnimationFrame(step);
}

export function LyricsPanel({
  lines,
  activeLineIndex,
  abLoopLineIndex,
  translationEditorLineIndex,
  translations,
  onTranslationChange,
  onTranslationEditEnd,
  onLineActivate,
  onOpenAssistant,
}: LyricsPanelProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const prevActiveRef = useRef<number>(-1);
  const scrollAnimRef = useRef<number | null>(null);
  const activeLineIndexRef = useRef(activeLineIndex);
  activeLineIndexRef.current = activeLineIndex;

  useEffect(
    () => (): void => {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
    },
    [],
  );

  /** Quando a altura do painel muda (flex, rotação, barra do browser), mantém o verso ativo no centro. */
  useEffect(() => {
    const root = scrollRef.current;
    if (root === null) return;

    const recenterActiveRow = (): void => {
      const idx = activeLineIndexRef.current;
      if (idx < 0) return;
      const row = rowRefs.current.get(idx);
      if (row === undefined) return;
      const target = computeScrollTopToCenterRow(root, row);
      root.scrollTop = target;
    };

    const ro = new ResizeObserver(recenterActiveRow);
    ro.observe(root);
    window.addEventListener("resize", recenterActiveRow);
    return (): void => {
      ro.disconnect();
      window.removeEventListener("resize", recenterActiveRow);
    };
  }, []);

  useEffect(() => {
    if (activeLineIndex < 0) {
      prevActiveRef.current = activeLineIndex;
      return;
    }
    const root = scrollRef.current;
    const row = rowRefs.current.get(activeLineIndex);
    if (!root || !row) {
      prevActiveRef.current = activeLineIndex;
      return;
    }

    const target = computeScrollTopToCenterRow(root, row);
    const indexDelta = Math.abs(activeLineIndex - prevActiveRef.current);
    prevActiveRef.current = activeLineIndex;

    const pixelTravel = Math.abs(target - root.scrollTop);
    const durationMs = 340 + pixelTravel * 0.45 + indexDelta * 28;

    runSmoothScrollTo(root, target, scrollAnimRef, durationMs);
  }, [activeLineIndex]);

  useEffect(() => {
    if (translationEditorLineIndex === null) return;
    const root = scrollRef.current;
    const row = rowRefs.current.get(translationEditorLineIndex);
    if (!root || !row) return;
    const target = computeScrollTopToCenterRow(root, row);
    runSmoothScrollTo(root, target, scrollAnimRef, 520);
  }, [translationEditorLineIndex]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-3 pb-32 sm:px-4 sm:pb-24 md:pb-16"
    >
      <div className="flex flex-col gap-1">
        {lines.map((line, index) => {
          const isActive = index === activeLineIndex;
          const isLooping = index === abLoopLineIndex;
          const isEditing = index === translationEditorLineIndex;
          const translationRaw = translations[index] ?? "";
          const hasTranslation = translationRaw.trim().length > 0;

          return (
            <div
              key={`${line.start}-${index}`}
              data-lyrics-row=""
              ref={(node): void => {
                if (node === null) {
                  rowRefs.current.delete(index);
                } else {
                  rowRefs.current.set(index, node);
                }
              }}
              className={[
                "rounded-xl px-3 py-3 transition-[background-color,box-shadow] duration-75 ease-out sm:px-4",
                isActive
                  ? "bg-white/[0.09] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                  : "bg-transparent hover:bg-white/[0.04]",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={(): void => {
                  onLineActivate(index);
                }}
                className="w-full text-left"
              >
                <p
                  className={[
                    "text-center text-lg font-medium leading-relaxed tracking-tight transition-[color,opacity,filter] duration-75 ease-out sm:text-xl",
                    isActive
                      ? "text-white opacity-100 [text-shadow:0_0_24px_rgba(255,255,255,0.12)]"
                      : "text-zinc-500 opacity-[0.82] sm:text-zinc-400",
                  ].join(" ")}
                >
                  {line.text}
                </p>
                {isLooping ? (
                  <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wider text-emerald-400/95 transition-opacity duration-75">
                    Loop A–B neste verso
                  </p>
                ) : null}
              </button>

              {isEditing ? (
                <div className="mt-2 space-y-2">
                  <label className="block">
                    <span className="sr-only">Tradução linha {index + 1}</span>
                    <input
                      type="text"
                      value={translationRaw}
                      onChange={(e): void => {
                        onTranslationChange(index, e.target.value);
                      }}
                      onClick={(e): void => {
                        e.stopPropagation();
                      }}
                      onBlur={(e: FocusEvent<HTMLInputElement>): void => {
                        const row = e.currentTarget.closest("[data-lyrics-row]");
                        const next = e.relatedTarget;
                        if (row !== null && next instanceof Node && row.contains(next)) {
                          return;
                        }
                        onTranslationEditEnd();
                      }}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>): void => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          onTranslationEditEnd();
                        }
                      }}
                      autoFocus
                      placeholder="Tradução / anotação"
                      className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {onOpenAssistant !== undefined ? (
                      <button
                        type="button"
                        onClick={(e): void => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenAssistant(index);
                        }}
                        className="text-xs font-semibold text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
                      >
                        Assistente
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(): void => {
                        onTranslationEditEnd();
                      }}
                      className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-400 hover:underline"
                    >
                      Fechar edição
                    </button>
                  </div>
                </div>
              ) : null}

              {!isEditing && hasTranslation ? (
                <p
                  className={[
                    "mt-2.5 w-full text-center text-[0.8125rem] font-normal leading-relaxed sm:text-sm",
                    isActive ? "text-emerald-200/85" : "text-emerald-200/55",
                  ].join(" ")}
                >
                  {translationRaw.trim()}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

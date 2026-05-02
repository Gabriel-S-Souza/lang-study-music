"use client";

import { useEffect, useRef, type ReactElement } from "react";

import type { TranscriptLine } from "@/types/transcript";

export interface LyricsPanelProps {
  readonly lines: readonly TranscriptLine[];
  readonly activeLineIndex: number;
  readonly abLoopLineIndex: number | null;
  /** Se não for `null`, só essa linha exibe o campo de tradução/anotação. */
  readonly translationEditorLineIndex: number | null;
  readonly translations: Readonly<Record<number, string>>;
  readonly onTranslationChange: (lineIndex: number, value: string) => void;
  readonly onLineActivate: (lineIndex: number) => void;
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

  const duration = Math.min(780, Math.max(280, durationMs));

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
  onLineActivate,
}: LyricsPanelProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const prevActiveRef = useRef<number>(-1);
  const scrollAnimRef = useRef<number | null>(null);

  useEffect(
    () => (): void => {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
    },
    [],
  );

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
          const showEditor = index === translationEditorLineIndex;
          return (
            <div
              key={`${line.start}-${index}`}
              ref={(node): void => {
                if (node === null) {
                  rowRefs.current.delete(index);
                } else {
                  rowRefs.current.set(index, node);
                }
              }}
              className={[
                "rounded-xl px-3 py-3 transition-[background-color,box-shadow] duration-500 ease-out sm:px-4",
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
                    "origin-center text-center text-lg font-medium leading-relaxed tracking-tight transition-[transform,color,opacity,filter] duration-500 ease-out sm:text-xl",
                    isActive
                      ? "scale-[1.03] text-white opacity-100 [text-shadow:0_0_24px_rgba(255,255,255,0.12)]"
                      : "scale-100 text-zinc-500 opacity-[0.82] sm:text-zinc-400",
                  ].join(" ")}
                >
                  {line.text}
                </p>
                {isLooping ? (
                  <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wider text-emerald-400/95 transition-opacity duration-500">
                    Loop A–B neste verso
                  </p>
                ) : null}
              </button>
              {showEditor ? (
                <label className="mt-2 block opacity-100 transition-opacity duration-300">
                  <span className="sr-only">Tradução linha {index + 1}</span>
                  <input
                    type="text"
                    value={translations[index] ?? ""}
                    onChange={(e): void => {
                      onTranslationChange(index, e.target.value);
                    }}
                    onClick={(e): void => {
                      e.stopPropagation();
                    }}
                    autoFocus
                    placeholder="Tradução / anotação"
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                  />
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

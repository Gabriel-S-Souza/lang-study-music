"use client";

import { useEffect, useRef } from "react";

import type { TranscriptLine } from "@/types/transcript";

/** Margem em segundos para detectar o fim do trecho A–B antes do player ultrapassar B. */
export const LOOP_END_EPSILON_SECONDS = 0.04;

export interface AbLoopWindow {
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface VideoProgressPayload {
  readonly currentTimeSeconds: number;
  readonly activeLineIndex: number;
}

/**
 * Monitora `getCurrentTime` via `requestAnimationFrame`, calcula o verso ativo e aplica loop A–B.
 */
export function useVideoProgressMonitor(
  player: YT.Player | null,
  lines: readonly TranscriptLine[] | null,
  abLoop: AbLoopWindow | null,
  onProgress: (payload: VideoProgressPayload) => void,
): void {
  const abLoopRef = useRef<AbLoopWindow | null>(abLoop);
  abLoopRef.current = abLoop;

  const linesRef = useRef<readonly TranscriptLine[] | null>(lines);
  linesRef.current = lines;

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (player === null) {
      return;
    }

    let rafId = 0;
    let cancelled = false;

    const tick = (): void => {
      if (cancelled) return;

      const currentTimeSeconds = player.getCurrentTime();
      const loop = abLoopRef.current;
      if (loop !== null && currentTimeSeconds >= loop.endSeconds - LOOP_END_EPSILON_SECONDS) {
        player.seekTo(loop.startSeconds, true);
      }

      const list = linesRef.current;
      let activeLineIndex = -1;
      if (list !== null && list.length > 0) {
        for (let i = 0; i < list.length; i++) {
          const line = list[i];
          if (!line) continue;
          const end = line.start + line.duration;
          if (currentTimeSeconds >= line.start && currentTimeSeconds < end) {
            activeLineIndex = i;
            break;
          }
        }
      }

      onProgressRef.current({ currentTimeSeconds, activeLineIndex });
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return (): void => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [player]);
}

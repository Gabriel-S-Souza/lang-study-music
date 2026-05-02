"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export interface UseYoutubeStudyPlayerResult {
  readonly mountRef: RefObject<HTMLDivElement | null>;
  readonly playerRef: RefObject<YT.Player | null>;
  readonly player: YT.Player | null;
  readonly playerReady: boolean;
}

/**
 * Monta `YT.Player` no nó `mountRef` e mantém referência estável para seek/getCurrentTime.
 */
export function useYoutubeStudyPlayer(
  apiReady: boolean,
  videoId: string | null,
): UseYoutubeStudyPlayerResult {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const [player, setPlayer] = useState<YT.Player | null>(null);
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    if (!apiReady || !videoId || !mountRef.current) {
      return;
    }

    const host = mountRef.current;
    host.innerHTML = "";

    const ytPlayer = new window.YT.Player(host, {
      videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        controls: 1,
      },
      events: {
        onReady: (event: YT.PlayerEvent): void => {
          playerRef.current = event.target;
          setPlayer(event.target);
          setPlayerReady(true);
        },
      },
    });

    return (): void => {
      setPlayerReady(false);
      setPlayer(null);
      playerRef.current = null;
      try {
        ytPlayer.destroy();
      } catch {
        /* noop */
      }
      host.innerHTML = "";
    };
  }, [apiReady, videoId]);

  return { mountRef, playerRef, player, playerReady };
}

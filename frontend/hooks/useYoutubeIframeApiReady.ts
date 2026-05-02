"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

function hasPlayerConstructor(): boolean {
  return typeof window !== "undefined" && Boolean(window.YT?.Player);
}

/**
 * Carrega https://www.youtube.com/iframe_api uma vez e sinaliza quando `YT.Player` existe.
 */
export function useYoutubeIframeApiReady(): boolean {
  const [ready, setReady] = useState(hasPlayerConstructor);

  useEffect(() => {
    if (hasPlayerConstructor()) {
      setReady(true);
      return;
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = (): void => {
      previous?.();
      setReady(true);
    };

    const selector = 'script[src="https://www.youtube.com/iframe_api"]';
    if (!document.querySelector(selector)) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      const firstScript = document.getElementsByTagName("script")[0];
      firstScript?.parentNode?.insertBefore(tag, firstScript);
    }
  }, []);

  return ready;
}

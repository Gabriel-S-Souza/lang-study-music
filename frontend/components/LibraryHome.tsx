"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

import { parseYoutubeVideoId } from "@/lib/youtube-id";
import {
  listSavedVideos,
  removeSavedVideo,
  type SavedVideoEntry,
} from "@/lib/saved-videos-storage";

function formatSavedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function LibraryHome(): ReactElement {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  /** Só lê `localStorage` após mount para o HTML do SSR bater com o primeiro paint no cliente. */
  const [savedHydrated, setSavedHydrated] = useState(false);
  const [saved, setSaved] = useState<SavedVideoEntry[]>([]);

  useEffect(() => {
    setSaved(listSavedVideos());
    setSavedHydrated(true);
  }, []);

  const refreshSaved = useCallback((): void => {
    setSaved(listSavedVideos());
  }, []);

  const thumbUrl = useCallback((videoId: string): string => {
    return `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
  }, []);

  const handleGoStudy = useCallback((): void => {
    setParseError(null);
    const id = parseYoutubeVideoId(urlInput);
    if (id === null) {
      setParseError("URL ou ID do YouTube inválido.");
      return;
    }
    router.push(`/study?v=${encodeURIComponent(id)}`);
  }, [router, urlInput]);

  const handleRemove = useCallback(
    (videoId: string): void => {
      removeSavedVideo(videoId);
      refreshSaved();
    },
    [refreshSaved],
  );

  const emptyLibrary = useMemo(() => saved.length === 0, [saved.length]);

  return (
    <div className="min-h-screen bg-[#121212] text-zinc-100">
      <header className="border-b border-white/10 px-2 py-4 sm:px-3 lg:px-4">
        <div className="mx-auto w-full max-w-[1800px]">
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Biblioteca</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Vídeos salvos neste navegador. Abra um link para estudar com legendas.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] px-2 py-6 sm:px-3 lg:px-4">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Novo vídeo</h2>
          <p className="mt-1 text-xs text-zinc-600 sm:text-sm">
            Cole a URL ou o ID; você será levado à sessão de estudo com legendas.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={urlInput}
              onChange={(e): void => {
                setUrlInput(e.target.value);
                setParseError(null);
              }}
              placeholder="URL ou ID do YouTube"
              className="min-h-11 w-full flex-1 rounded-lg border border-white/10 bg-black/50 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 sm:max-w-xl"
            />
            <button
              type="button"
              onClick={handleGoStudy}
              className="min-h-11 shrink-0 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-black transition hover:bg-emerald-400"
            >
              Ir estudar
            </button>
          </div>
          {parseError !== null ? <p className="mt-2 text-sm text-red-400">{parseError}</p> : null}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Salvos</h2>
          {!savedHydrated ? (
            <p className="mt-4 text-center text-sm text-zinc-600" aria-live="polite">
              Carregando salvos…
            </p>
          ) : emptyLibrary ? (
            <p className="mt-4 text-center text-sm text-zinc-600">
              Nenhum vídeo na biblioteca ainda. Salve a partir da sessão de estudo ou use o campo acima.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {saved.map((item) => (
                <li
                  key={item.videoId}
                  className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50 shadow-sm"
                >
                  <div className="relative aspect-video w-full bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element -- domínio externo sem otimização Next */}
                    <img
                      src={thumbUrl(item.videoId)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="line-clamp-2 break-all text-xs text-zinc-300 sm:text-sm" title={item.inputUrl}>
                      {item.inputUrl}
                    </p>
                    <p className="text-[0.65rem] text-zinc-600 sm:text-xs">{formatSavedAt(item.savedAt)}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link
                        href={`/study?v=${encodeURIComponent(item.videoId)}`}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-black transition hover:bg-emerald-400 sm:text-sm"
                      >
                        Abrir
                      </Link>
                      <button
                        type="button"
                        onClick={(): void => {
                          handleRemove(item.videoId);
                        }}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/15 px-3 text-xs font-medium text-zinc-400 transition hover:bg-white/10 sm:text-sm"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

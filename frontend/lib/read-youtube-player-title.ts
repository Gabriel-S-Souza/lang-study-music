/**
 * Lê o título do vídeo exposto pela IFrame API (síncrono).
 * Falhas ou ausência de dados retornam null (não lançar).
 */
export function readYoutubePlayerTitle(player: YT.Player | null): string | null {
  if (player === null) {
    return null;
  }
  try {
    const raw = player.getVideoData()?.title;
    if (typeof raw !== "string") {
      return null;
    }
    const t = raw.trim();
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

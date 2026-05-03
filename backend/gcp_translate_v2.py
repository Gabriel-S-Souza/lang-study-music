"""Google Cloud Translation API v2 — helpers compartilhados."""

from __future__ import annotations

_CHUNK_SIZE = 100


def translate_texts_v2(
    texts: list[str],
    *,
    source_language: str,
    target_language: str,
) -> list[str]:
    """Traduz `texts` preservando ordem; fragmenta em lotes para o limite prático da API."""
    from google.cloud import translate_v2 as translate  # type: ignore[import-untyped]

    if not texts:
        return []

    client = translate.Client()
    src = source_language.strip() or "en"
    tgt = target_language.strip() or "pt"

    out: list[str] = []
    for start in range(0, len(texts), _CHUNK_SIZE):
        chunk = texts[start : start + _CHUNK_SIZE]
        raw = client.translate(chunk, source_language=src, target_language=tgt)
        if len(chunk) == 1:
            batch = [raw] if isinstance(raw, dict) else list(raw)
        else:
            if not isinstance(raw, list):
                msg = "Cloud Translation devolveu formato inesperado."
                raise RuntimeError(msg)
            batch = raw
        if len(batch) != len(chunk):
            msg = "Cloud Translation devolveu contagem de segmentos inesperada."
            raise RuntimeError(msg)
        for item in batch:
            if not isinstance(item, dict):
                msg = "Cloud Translation devolveu item inesperado."
                raise RuntimeError(msg)
            translated = item.get("translatedText")
            if not translated or not isinstance(translated, str):
                msg = "Cloud Translation devolveu resposta vazia."
                raise RuntimeError(msg)
            out.append(translated)
    return out

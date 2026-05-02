"""Phrase study chat: Gemini with structured opening + Cloud Translation fallback."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from prompts import CONTINUATION_SYSTEM, OPENING_SYSTEM, OPENING_USER_TEMPLATE

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_MODEL_FLASH = "gemini-3-flash-preview"
DEFAULT_MODEL_FLASH_LITE = "gemini-3.1-flash-lite-preview"

MODEL_FLASH = os.getenv("GEMINI_MODEL_FLASH", DEFAULT_MODEL_FLASH).strip()
MODEL_FLASH_LITE = os.getenv("GEMINI_MODEL_FLASH_LITE", DEFAULT_MODEL_FLASH_LITE).strip()

ALLOWED_MODEL_IDS: frozenset[str] = frozenset({MODEL_FLASH, MODEL_FLASH_LITE})

VIDEO_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{11}$")


class ChatMessageIn(BaseModel):
    role: Literal["user", "model"]
    content: str = Field(min_length=1, max_length=32000)


class PhraseChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    model_id: str = Field(alias="modelId", min_length=1, max_length=128)
    video_id: str = Field(alias="videoId", min_length=11, max_length=11)
    line_index: int = Field(alias="lineIndex", ge=0, le=500_000)
    line_text: str = Field(alias="lineText", min_length=1, max_length=4000)
    messages: list[ChatMessageIn] = Field(default_factory=list)


class ReusableChunkOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    phrase_en: str = Field(alias="phraseEn")
    explanation_pt: str = Field(alias="explanationPt")


class PhraseChatResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    fallback: bool = False
    suggested_translation_pt: str | None = Field(default=None, alias="suggestedTranslationPt")
    grammar_topics: list[str] | None = Field(default=None, alias="grammarTopics")
    reusable_chunks: list[ReusableChunkOut] | None = Field(default=None, alias="reusableChunks")
    explanation: str | None = None
    assistant_message: str = Field(alias="assistantMessage")
    raw_assistant_text: str | None = Field(default=None, alias="rawAssistantText")


class _OpeningJson(BaseModel):
    suggested_translation_pt: str
    grammar_topics: list[str]
    reusable_chunks: list[dict[str, str]]
    explanation: str


def _format_opening_chat_body(parsed: _OpeningJson) -> str:
    topics = ", ".join(parsed.grammar_topics) if parsed.grammar_topics else "(nenhum)"
    chunks_lines: list[str] = []
    for c in parsed.reusable_chunks:
        pe = (c.get("phrase_en") or c.get("phraseEn") or "").strip()
        ex = (c.get("explanation_pt") or c.get("explanationPt") or "").strip()
        if pe or ex:
            chunks_lines.append(f"- **{pe}** — {ex}")
    chunks_block = "\n".join(chunks_lines) if chunks_lines else "_Nenhum chunk destacado._"
    return (
        f"### Tradução sugerida\n{parsed.suggested_translation_pt}\n\n"
        f"### Tópicos (inglês)\n{topics}\n\n"
        f"### Pedaços reutilizáveis\n{chunks_block}\n\n"
        f"### Explicação\n{parsed.explanation}"
    )


def _normalize_opening_chunks(raw: list[dict[str, str]]) -> list[ReusableChunkOut]:
    out: list[ReusableChunkOut] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        pe = str(item.get("phrase_en") or item.get("phraseEn") or "").strip()
        ex = str(item.get("explanation_pt") or item.get("explanationPt") or "").strip()
        if pe or ex:
            out.append(ReusableChunkOut(phraseEn=pe, explanationPt=ex))
    return out


def _translate_en_to_pt(text: str) -> str:
    from google.cloud import translate_v2 as translate  # type: ignore[import-untyped]

    client = translate.Client()
    result = client.translate(text, source_language="en", target_language="pt")
    translated = result.get("translatedText")
    if not translated or not isinstance(translated, str):
        msg = "Cloud Translation devolveu resposta vazia."
        raise RuntimeError(msg)
    return translated


def _gemini_client():
    from google import genai  # type: ignore[import-untyped]

    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY não configurada no servidor.",
        )
    return genai.Client(api_key=key)


def _generate_opening(model_id: str, line_text: str) -> tuple[_OpeningJson, str]:
    from google.genai import types  # type: ignore[import-untyped]

    client = _gemini_client()
    user_text = OPENING_USER_TEMPLATE.format(line_text=line_text.strip())
    schema = {
        "type": "object",
        "properties": {
            "suggested_translation_pt": {"type": "string"},
            "grammar_topics": {"type": "array", "items": {"type": "string"}},
            "reusable_chunks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "phrase_en": {"type": "string"},
                        "explanation_pt": {"type": "string"},
                    },
                    "required": ["phrase_en", "explanation_pt"],
                },
            },
            "explanation": {"type": "string"},
        },
        "required": ["suggested_translation_pt", "grammar_topics", "reusable_chunks", "explanation"],
    }

    config = types.GenerateContentConfig(
        system_instruction=OPENING_SYSTEM,
        response_mime_type="application/json",
        response_json_schema=schema,
    )
    response = client.models.generate_content(
        model=model_id,
        contents=user_text,
        config=config,
    )
    raw = (response.text or "").strip()
    if not raw:
        msg = "Resposta vazia do Gemini."
        raise RuntimeError(msg)
    data = json.loads(raw)
    parsed = _OpeningJson.model_validate(data)
    chat_body = _format_opening_chat_body(parsed)
    return parsed, chat_body


def _generate_continue(model_id: str, messages: list[ChatMessageIn]) -> str:
    from google.genai import types  # type: ignore[import-untyped]

    client = _gemini_client()
    contents: list[types.Content] = []
    for m in messages:
        r: Literal["user", "model"] = "model" if m.role == "model" else "user"
        contents.append(
            types.Content(
                role=r,
                parts=[types.Part.from_text(text=m.content)],
            )
        )
    config = types.GenerateContentConfig(system_instruction=CONTINUATION_SYSTEM)
    response = client.models.generate_content(
        model=model_id,
        contents=contents,
        config=config,
    )
    text = (response.text or "").strip()
    if not text:
        msg = "Resposta vazia do Gemini."
        raise RuntimeError(msg)
    return text


def _opening_fallback(line_text: str) -> PhraseChatResponse:
    try:
        pt = _translate_en_to_pt(line_text)
    except Exception as e:
        logger.warning("Translation fallback failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Gemini indisponível e tradução automática falhou: {e!s}",
        ) from e
    assistant = (
        "O assistente de IA não respondeu a tempo ou houve erro. "
        "Segue apenas a tradução automática (Google Cloud Translation):\n\n"
        f"**{pt}**"
    )
    return PhraseChatResponse(
        fallback=True,
        suggestedTranslationPt=pt,
        assistantMessage=assistant,
        rawAssistantText=pt,
    )


@router.post(
    "/phrase-chat",
    response_model=PhraseChatResponse,
    response_model_by_alias=True,
)
def phrase_chat(body: PhraseChatRequest) -> PhraseChatResponse:
    if body.model_id not in ALLOWED_MODEL_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"modelId inválido. Use um de: {sorted(ALLOWED_MODEL_IDS)}",
        )
    if not VIDEO_ID_PATTERN.match(body.video_id):
        raise HTTPException(status_code=422, detail="videoId inválido.")

    model_id = body.model_id
    line_text = body.line_text.strip()

    if len(body.messages) == 0:
        try:
            parsed, assistant_message = _generate_opening(model_id, line_text)
        except HTTPException as he:
            if he.status_code == 503:
                logger.warning("Gemini indisponível (%s), usando tradução automática.", he.detail)
                return _opening_fallback(line_text)
            raise
        except Exception as e:
            logger.warning("Gemini opening failed: %s", e, exc_info=True)
            return _opening_fallback(line_text)

        chunks = _normalize_opening_chunks(
            [c for c in parsed.reusable_chunks if isinstance(c, dict)]
        )
        return PhraseChatResponse(
            fallback=False,
            suggestedTranslationPt=parsed.suggested_translation_pt,
            grammarTopics=list(parsed.grammar_topics),
            reusableChunks=chunks,
            explanation=parsed.explanation,
            assistantMessage=assistant_message,
            rawAssistantText=json.dumps(parsed.model_dump(), ensure_ascii=False),
        )

    try:
        assistant_text = _generate_continue(model_id, body.messages)
    except HTTPException as he:
        if he.status_code == 503:
            logger.warning("Gemini indisponível (%s), usando tradução automática.", he.detail)
            return _opening_fallback(line_text)
        raise
    except Exception as e:
        logger.warning("Gemini continue failed: %s", e, exc_info=True)
        return _opening_fallback(line_text)

    return PhraseChatResponse(
        fallback=False,
        assistantMessage=assistant_text,
        rawAssistantText=assistant_text,
    )

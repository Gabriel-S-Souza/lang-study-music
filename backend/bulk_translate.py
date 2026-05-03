"""Tradução em lote (legendas) via Google Cloud Translation v2."""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from gcp_translate_v2 import translate_texts_v2

logger = logging.getLogger(__name__)

router = APIRouter()

VIDEO_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{11}$")

_MAX_ITEMS = 1200
_TARGET_LANG = "pt"


class BulkLineIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    line_index: int = Field(alias="lineIndex", ge=0, le=500_000)
    text: str = Field(min_length=1, max_length=4000)


class BulkTranslateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    video_id: str = Field(alias="videoId", min_length=11, max_length=11)
    source_language: str = Field(default="en", alias="sourceLanguage", min_length=2, max_length=16)
    items: list[BulkLineIn] = Field(min_length=1, max_length=_MAX_ITEMS)

    @field_validator("source_language")
    @classmethod
    def strip_source(cls, v: str) -> str:
        s = v.strip()
        return s if s else "en"


class BulkTranslateLineOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    line_index: int = Field(alias="lineIndex")
    translated_text: str = Field(alias="translatedText")


class BulkTranslateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    translations: list[BulkTranslateLineOut]


@router.post(
    "/bulk-translate",
    response_model=BulkTranslateResponse,
    response_model_by_alias=True,
)
def bulk_translate(body: BulkTranslateRequest) -> BulkTranslateResponse:
    if not VIDEO_ID_PATTERN.match(body.video_id):
        raise HTTPException(status_code=422, detail="videoId inválido.")

    texts = [it.text.strip() for it in body.items]
    for i, t in enumerate(texts):
        if not t:
            raise HTTPException(
                status_code=422,
                detail=f"items[{i}].text não pode ser vazio após trim.",
            )

    try:
        translated = translate_texts_v2(
            texts,
            source_language=body.source_language,
            target_language=_TARGET_LANG,
        )
    except Exception as e:
        logger.warning("bulk_translate failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"Tradução automática falhou: {e!s}",
        ) from e

    out = [
        BulkTranslateLineOut(lineIndex=body.items[i].line_index, translatedText=translated[i])
        for i in range(len(translated))
    ]
    return BulkTranslateResponse(translations=out)

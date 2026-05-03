"""FastAPI app: YouTube transcript lines for study UI."""

from __future__ import annotations

import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
from typing import Annotated

from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    CouldNotRetrieveTranscript,
    IpBlocked,
    RequestBlocked,
    YouTubeRequestFailed,
)

from http_logging_middleware import HttpRequestLoggingMiddleware, setup_http_request_logging
from study_phrase import router as study_phrase_router

VIDEO_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{11}$")

DEFAULT_LANGS = ("en", "en-US", "en-GB", "en-IN")


class TranscriptLine(BaseModel):
    text: str
    start: float = Field(description="Seconds from video start")
    duration: float = Field(description="Seconds this caption stays on screen")


class TranscriptResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    video_id: str = Field(serialization_alias="videoId")
    language: str
    language_code: str = Field(serialization_alias="languageCode")
    is_generated: bool = Field(serialization_alias="isGenerated")
    lines: list[TranscriptLine]


app = FastAPI(title="English Study Music API", version="1.0.0")

setup_http_request_logging()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(HttpRequestLoggingMiddleware)

_ytt_api = YouTubeTranscriptApi()

app.include_router(study_phrase_router, prefix="/api/study", tags=["study"])


@app.get("/api/videos/{video_id}/transcript", response_model=TranscriptResponse)
def get_transcript(
    video_id: Annotated[str, Path(min_length=11, max_length=11)],
) -> TranscriptResponse:
    if not VIDEO_ID_PATTERN.match(video_id):
        raise HTTPException(status_code=422, detail="Invalid YouTube video id format.")

    try:
        fetched = _ytt_api.fetch(video_id, languages=list(DEFAULT_LANGS))
    except (YouTubeRequestFailed, RequestBlocked, IpBlocked) as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except CouldNotRetrieveTranscript as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    lines: list[TranscriptLine] = []
    for snippet in fetched:
        text = (snippet.text or "").strip()
        if not text:
            continue
        lines.append(
            TranscriptLine(
                text=text,
                start=float(snippet.start),
                duration=float(snippet.duration),
            )
        )

    return TranscriptResponse(
        video_id=video_id,
        language=getattr(fetched, "language", "unknown"),
        language_code=getattr(fetched, "language_code", "unknown"),
        is_generated=bool(getattr(fetched, "is_generated", False)),
        lines=lines,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

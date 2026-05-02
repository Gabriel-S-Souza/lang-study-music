"""Middleware: regista método, caminho, status e duração de cada pedido HTTP."""

from __future__ import annotations

import logging
import time
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

LOG = logging.getLogger("english_study.http")


def setup_http_request_logging() -> None:
    """Garante um handler no nosso logger (evita depender só da config do root)."""
    if LOG.handlers:
        return
    LOG.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("[english_study.http] %(message)s"),
    )
    LOG.addHandler(handler)
    LOG.propagate = False


class HttpRequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Response]) -> Response:
        path = request.url.path
        if request.url.query:
            path = f"{path}?{request.url.query}"
        client = request.client.host if request.client else "-"
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = (time.perf_counter() - start) * 1000
            LOG.exception("%s %s client=%s FAILED after %.1fms", request.method, path, client, elapsed_ms)
            raise
        elapsed_ms = (time.perf_counter() - start) * 1000
        LOG.info(
            "%s %s -> %s client=%s %.1fms",
            request.method,
            path,
            response.status_code,
            client,
            elapsed_ms,
        )
        return response

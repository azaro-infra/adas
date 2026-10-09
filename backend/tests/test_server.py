import asyncio
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from cabin_agent import server
from test_workflow import request


async def test_disconnect_cancels_graph_and_releases_request_lock(monkeypatch):
    started, cancelled = asyncio.Event(), asyncio.Event()

    async def slow_run(manager, body):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    async def is_disconnected():
        return started.is_set()

    monkeypatch.setattr(server, "execute", slow_run)
    server.app.state.lock = asyncio.Lock()
    server.app.state.manager = object()
    with pytest.raises(HTTPException) as error:
        await server.analyze(request(), SimpleNamespace(is_disconnected=is_disconnected))
    assert error.value.status_code == 499
    assert cancelled.is_set()
    assert not server.app.state.lock.locked()


async def test_concurrent_request_is_rejected():
    server.app.state.lock = asyncio.Lock()
    async with server.app.state.lock:
        with pytest.raises(HTTPException) as error:
            await server.analyze(request(), None)
    assert error.value.status_code == 429


async def test_backend_rejects_browser_origins_and_oversized_bodies():
    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/analyze", headers={"origin": "https://example.com"}, json={})
        assert response.status_code == 403
        response = await client.post("/analyze", content=b"x" * 1_600_001)
        assert response.status_code == 413

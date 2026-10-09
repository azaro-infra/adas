"""Local HTTP adapter around NVIDIA's configured workflow, not a custom agent loop."""
import asyncio
import contextlib
import importlib.metadata
import json
import os
import time
from pathlib import Path

# Do not export local frames, tool calls or traces to telemetry services.
os.environ["NAT_TELEMETRY_ENABLED"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["OTEL_SDK_DISABLED"] = "true"

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from nat.builder.runtime_event_subscriber import pull_intermediate
from nat.runtime.loader import load_workflow

from .models import AnalysisInput, RunState, current_run
from .vision import OLLAMA_URL, model_name

CONFIG_PATH = Path(__file__).resolve().parents[1] / "configs" / "cabin.yml"
NAT_VERSION = importlib.metadata.version("nvidia-nat")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    model_name()  # Reject unsupported/cloud model names before workflow construction.
    async with load_workflow(CONFIG_PATH, max_concurrency=1) as manager:
        app.state.manager = manager
        app.state.lock = asyncio.Lock()
        yield


app = FastAPI(title="Cabin Lab — NVIDIA NeMo Agent Toolkit", lifespan=lifespan)


@app.middleware("http")
async def local_requests_only(request: Request, call_next):
    # Next.js calls server-to-server without Origin. No browser cross-origin access.
    if request.headers.get("origin"):
        return JSONResponse({"error": "Use the Next.js dashboard API."}, status_code=403)
    if request.url.path == "/analyze":
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > 1_600_000:
                return JSONResponse({"error": "Request too large."}, status_code=413)
        request._body = bytes(data)
    return await call_next(request)


@app.get("/health")
async def health():
    name = model_name()
    try:
        async with httpx.AsyncClient(timeout=3, trust_env=False) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            response.raise_for_status()
            ready = any(item["name"] == name for item in response.json()["models"])
        message = "NeMo agent and local model ready" if ready else f"Download the model: ollama pull {name}"
    except httpx.HTTPError:
        ready, message = False, "Start Ollama: OLLAMA_NO_CLOUD=1 ollama serve"
    return {"ready": ready, "model": name, "message": message, "framework": f"NVIDIA NeMo Agent Toolkit {NAT_VERSION}"}


def summarize_events(events: list[dict]) -> tuple[list[dict], int, float]:
    """Keep real NAT event names/timings; omit raw prompts, images and reasoning."""
    trace, starts = [], {}
    model_calls, model_ms = 0, 0.0
    for event in events:
        item = event["payload"]
        kind = str(item["event_type"])
        if kind.endswith("_START"):
            starts[item["UUID"]] = item["event_timestamp"]
        if kind not in {"LLM_END", "TOOL_END", "WORKFLOW_END"}:
            continue
        elapsed = max(0, (item["event_timestamp"] - starts.get(item["UUID"], item["event_timestamp"])) * 1000)
        if kind == "LLM_END":
            model_calls += 1
            model_ms += elapsed
        trace.append({"step": kind, "detail": item.get("name") or "NVIDIA NeMo workflow", "durationMs": round(elapsed)})
    return trace, model_calls, model_ms


async def execute(manager, body: AnalysisInput) -> dict:
    start = time.perf_counter()
    state = RunState(request=body, vehicle=body.vehicle.model_copy(deep=True))
    token = current_run.set(state)
    try:
        # Only text history is forwarded. inspect_frame accesses the request's JPEG.
        history = [message.model_dump() for message in body.history] if body.mode == "ask" else []
        message = json.dumps({
            "mode": body.mode, "question": body.question,
            "recent_conversation": history,
            "instruction": "Use tools to obtain current facts. A captured image and simulated vehicle are available.",
        })
        async with manager.run(message) as runner:
            events_ready = pull_intermediate()
            answer = await runner.result(to_type=str)
            events = await events_ready
        if not answer.strip() or "could not produce a final answer within" in answer:
            raise RuntimeError("The agent did not finish within four tool rounds. Simplify the question.")
        trace, model_calls, model_ms = summarize_events(events)
        return {
            "output": {"answer": answer, "observations": state.observations, "uncertainty": "Visual answers describe one sampled frame and may be inaccurate."},
            "vehicle": state.vehicle.model_dump(),
            "toolExecutions": state.executions,
            "capturedAt": body.capturedAt, "videoTime": body.videoTime,
            "model": model_name(), "framework": f"NVIDIA NeMo Agent Toolkit {NAT_VERSION}",
            "metrics": {"totalMs": round((time.perf_counter() - start) * 1000), "modelMs": round(model_ms + state.vision_ms), "modelCalls": model_calls + state.vision_calls, "toolCalls": len(state.executions)},
            "trace": trace,
        }
    finally:
        current_run.reset(token)


@app.post("/analyze")
async def analyze(body: AnalysisInput, request: Request):
    if app.state.lock.locked():
        raise HTTPException(429, "The local agent is busy. Try again shortly.")
    async with app.state.lock:
        task = asyncio.create_task(execute(app.state.manager, body))
        try:
            # If the browser aborts, Next.js aborts this request; cancel the graph.
            async with asyncio.timeout(180):
                while not task.done():
                    if await request.is_disconnected():
                        raise HTTPException(499, "Request cancelled.")
                    await asyncio.wait({task}, timeout=0.2)
                return await task
        except TimeoutError:
            raise HTTPException(504, "Local agent timed out after 180 seconds.") from None
        except HTTPException:
            raise
        except Exception as error:
            # Do not serialize raw prompts or framework exception internals.
            raise HTTPException(502, f"Local NeMo workflow failed ({type(error).__name__}). Check the backend terminal.") from error
        finally:
            if not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

"""Run NVIDIA's real graph and registered tools with only model output replaced."""
import json
from pathlib import Path

import pytest
from langchain_core.messages import AIMessageChunk, ToolMessage
from langchain_core.outputs import ChatGenerationChunk
from langchain_openai import ChatOpenAI
from nat.runtime.loader import load_workflow

from cabin_agent import tools
from cabin_agent.models import AnalysisInput
from cabin_agent.server import CONFIG_PATH, execute


def request(question="Set the cabin temperature to 20 °C.", mode="ask"):
    import base64
    image = Path(__file__).resolve().parents[2] / "tests/fixtures/test-frame.jpg"
    return AnalysisInput(
        image=base64.b64encode(image.read_bytes()).decode(),
        capturedAt="2026-09-30T10:00:00.000Z", videoTime=0,
        question=question, mode=mode,
        vehicle={"speedKph": 0, "batteryPercent": 76, "cabinTemperature": 22},
    )


def model_script(monkeypatch, calls, seen):
    async def stream(self, messages, **kwargs):
        seen.append(messages)
        if any(isinstance(message, ToolMessage) for message in messages):
            content = "Tool results received: " + " ".join(
                str(message.content) for message in messages if isinstance(message, ToolMessage)
            )
            yield ChatGenerationChunk(message=AIMessageChunk(content=content))
        else:
            yield ChatGenerationChunk(message=AIMessageChunk(content="", tool_call_chunks=[
                {"name": name, "args": json.dumps(args), "id": f"call-{i}", "index": i}
                for i, (name, args) in enumerate(calls)
            ]))
    monkeypatch.setattr(ChatOpenAI, "_astream", stream)


async def test_native_loop_returns_applied_tool_result_to_model(monkeypatch):
    seen = []
    model_script(monkeypatch, [("set_cabin_temperature", {"temperature": 20})], seen)
    body = request()
    async with load_workflow(CONFIG_PATH) as manager:
        result = await execute(manager, body)
    assert result["vehicle"]["cabinTemperature"] == 20
    assert body.vehicle.cabinTemperature == 22  # original browser snapshot unchanged
    assert len(seen) == 2  # model -> real tool -> model, rather than fabricated answer
    assert result["toolExecutions"][0]["result"]["applied"] is True
    assert '"applied": true' in result["output"]["answer"]
    assert result["metrics"]["modelCalls"] == 2
    assert any(step["step"] == "TOOL_END" for step in result["trace"])


@pytest.mark.parametrize("question,mode,target", [
    ("Set the cabin temperature to 20 °C.", "observe", 20),
    ("What is the battery level?", "ask", 20),
    ("Do not set the cabin temperature to 20 °C.", "ask", 20),
    ("Set the cabin temperature to 20 °C.", "ask", 25),
    ("Set the cabin temperature to 30 °C.", "ask", 30),
    ("Set the cabin temperature to 20 F.", "ask", 20),
])
async def test_policy_rejection_is_a_real_tool_result(monkeypatch, question, mode, target):
    model_script(monkeypatch, [("set_cabin_temperature", {"temperature": target})], [])
    async with load_workflow(CONFIG_PATH) as manager:
        result = await execute(manager, request(question, mode))
    assert result["vehicle"]["cabinTemperature"] == 22
    assert result["toolExecutions"][0]["status"] == "blocked"
    assert '"blocked": true' in result["output"]["answer"]


async def test_vision_and_telemetry_use_registered_tools(monkeypatch):
    async def inspect(question):
        assert "text" in question
        return "CABIN LAB"
    monkeypatch.setattr(tools, "inspect_image", inspect)
    seen = []
    model_script(monkeypatch, [
        ("inspect_frame", {"question": "Read the text"}), ("read_vehicle_status", {}),
    ], seen)
    async with load_workflow(CONFIG_PATH) as manager:
        result = await execute(manager, request("Read the image and battery."))
    assert result["output"]["observations"] == ["CABIN LAB"]
    assert "76" in result["output"]["answer"]
    assert len([message for message in seen[-1] if isinstance(message, ToolMessage)]) == 2


async def test_failed_model_discards_simulator_snapshot(monkeypatch):
    async def fail_after_tool(self, messages, **kwargs):
        if any(isinstance(message, ToolMessage) for message in messages):
            raise RuntimeError("Model disconnected")
        yield ChatGenerationChunk(message=AIMessageChunk(content="", tool_call_chunks=[
            {"name": "set_cabin_temperature", "args": '{"temperature":20}', "id": "one", "index": 0},
        ]))
    monkeypatch.setattr(ChatOpenAI, "_astream", fail_after_tool)
    body = request()
    async with load_workflow(CONFIG_PATH) as manager:
        with pytest.raises(RuntimeError, match="Model disconnected"):
            await execute(manager, body)
    assert body.vehicle.cabinTemperature == 22
    with pytest.raises(LookupError):
        tools.current_run.get()

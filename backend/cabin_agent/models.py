import base64
import math
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Vehicle(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    speedKph: float = Field(ge=0, le=130)
    batteryPercent: float = Field(ge=0, le=100)
    cabinTemperature: float = Field(ge=16, le=28)


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class AnalysisInput(BaseModel):
    image: str = Field(max_length=1_500_000)
    capturedAt: str = Field(max_length=40)
    videoTime: float = Field(ge=0, allow_inf_nan=False)
    question: str = Field(min_length=1, max_length=800)
    mode: Literal["ask", "observe"]
    vehicle: Vehicle
    history: list[HistoryMessage] = Field(default_factory=list, max_length=6)

    @field_validator("image")
    @classmethod
    def jpeg_only(cls, value: str) -> str:
        decoded = base64.b64decode(value, validate=True)
        if not decoded.startswith(b"\xff\xd8\xff"):
            raise ValueError("Expected a base64 JPEG frame")
        return value


@dataclass
class RunState:
    request: AnalysisInput
    vehicle: Vehicle
    executions: list[dict] = field(default_factory=list)
    observations: list[str] = field(default_factory=list)
    # Vision-tool latency is separate from the native agent LLM event timings.
    vision_ms: float = 0
    vision_calls: int = 0


# Each request gets its own copied simulation. NAT's async tool calls inherit
# this context; there is no shared/global vehicle state between browser tabs.
current_run: ContextVar[RunState] = ContextVar("cabin_current_run")


def require_temperature(value: float) -> float:
    if isinstance(value, bool) or not math.isfinite(value) or not 16 <= value <= 28:
        raise ValueError("Temperature must be between 16 and 28 °C.")
    return value

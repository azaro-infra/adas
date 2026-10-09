import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Run against the real Next.js server and NeMo agent and local Ollama model. No mocks.
const origin = "http://127.0.0.1:3000";
const image = await readFile(
  new URL("../tests/fixtures/test-frame.jpg", import.meta.url),
);
const common = {
  image: image.toString("base64"),
  capturedAt: new Date().toISOString(),
  videoTime: 0,
  vehicle: { speedKph: 0, batteryPercent: 76, cabinTemperature: 22 },
  history: [],
  mode: "ask",
};

async function ask(question) {
  const response = await fetch(`${origin}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ ...common, question }),
    signal: AbortSignal.timeout(200_000),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  console.log(
    JSON.stringify(
      {
        question,
        answer: result.output.answer,
        tools: result.toolExecutions,
        metrics: result.metrics,
      },
      null,
      2,
    ),
  );
  return result;
}

const scene = await ask(
  "Read the large text in this image and tell me the simulated battery level.",
);
assert.match(scene.output.answer, /CABIN LAB/i);
assert.match(scene.output.answer, /76/);
assert.deepEqual(
  new Set(scene.toolExecutions.map((tool) => tool.name)),
  new Set(["inspect_frame", "read_vehicle_status"]),
);
assert.ok(scene.framework.includes("NVIDIA NeMo Agent Toolkit"));
assert.ok(scene.metrics.modelCalls >= 3);
assert.ok(scene.trace.some((step) => step.step === "LLM_END"));

const action = await ask("Set the cabin temperature to 20 °C.");
assert.equal(action.vehicle.cabinTemperature, 20);
assert.ok(
  action.toolExecutions.some(
    (tool) => tool.name === "set_cabin_temperature" && tool.result.applied,
  ),
);
assert.ok(action.metrics.modelCalls >= 2);
assert.match(action.output.answer, /20/);
console.log(
  "PASS: NVIDIA NeMo native tool loop, local vision, telemetry, and applied simulator change.",
);

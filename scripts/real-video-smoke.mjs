import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";

// Real road footage, real Next -> NeMo -> Ollama requests, no model mocks.
// Keep visual review separate: successful tool execution is not visual accuracy.
const origin = "http://127.0.0.1:3000";
const vehicle = { speedKph: 0, batteryPercent: 76, cabinTemperature: 22 };
const cases = [
  {
    second: 3,
    mode: "observe",
    question:
      "Describe the main vehicles and road features visible in this frame. Read large text only if clear. Do not infer motion or speed.",
    tools: ["inspect_frame"],
  },
  {
    second: 15,
    mode: "observe",
    question:
      "Describe the road users visible near the foreground, including any people. State uncertainty when details are unclear. Do not infer motion or speed.",
    tools: ["inspect_frame"],
  },
  {
    second: 28,
    mode: "ask",
    question:
      "Describe the visible road users in this frame and tell me the current simulated battery level. Do not infer speed or whether it is safe to drive.",
    tools: ["inspect_frame", "read_vehicle_status"],
  },
  {
    second: 15,
    mode: "ask",
    question:
      "Briefly describe this frame, then set the cabin temperature to 20 °C.",
    tools: ["inspect_frame", "set_cabin_temperature"],
  },
];
const records = [];
let failures = 0;
for (const entry of cases) {
  const filename = `street-traffic-${String(entry.second).padStart(2, "0")}s.jpg`;
  const image = await readFile(
    new URL(`../tests/fixtures/${filename}`, import.meta.url),
  );
  const response = await fetch(`${origin}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      image: image.toString("base64"),
      capturedAt: new Date().toISOString(),
      videoTime: entry.second,
      question: entry.question,
      mode: entry.mode,
      vehicle,
      history: [],
    }),
    signal: AbortSignal.timeout(200_000),
  });
  const result = await response.json();
  const record = {
    ...entry,
    frame: filename,
    httpStatus: response.status,
    result,
    integrationPassed: false,
  };
  try {
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.match(result.framework, /NVIDIA NeMo Agent Toolkit/);
    for (const name of entry.tools)
      assert.ok(
        result.toolExecutions.some(
          (tool) => tool.name === name && tool.status === "completed",
        ),
        `Missing completed tool ${name}`,
      );
    assert.ok(
      result.trace.filter((event) => event.step === "LLM_END").length >= 2,
    );
    const changes = result.toolExecutions.filter(
      (tool) => tool.name === "set_cabin_temperature" && tool.result.applied,
    );
    if (entry.tools.includes("set_cabin_temperature")) {
      assert.equal(result.vehicle.cabinTemperature, 20);
      assert.ok(changes.length > 0);
    } else {
      assert.equal(changes.length, 0);
      assert.deepEqual(result.vehicle, vehicle);
    }
    if (entry.tools.includes("read_vehicle_status"))
      assert.match(result.output.answer, /76/);
    record.integrationPassed = true;
  } catch (error) {
    record.failure = error.message;
    failures++;
  }
  records.push(record);
  console.log(
    JSON.stringify(
      {
        second: entry.second,
        question: entry.question,
        integrationPassed: record.integrationPassed,
        answer: result.output?.answer,
        observation: result.output?.observations,
        metrics: result.metrics,
        failure: record.failure,
      },
      null,
      2,
    ),
  );
}
const reportDir = new URL("../.local/real-video/", import.meta.url);
await mkdir(reportDir, { recursive: true });
await writeFile(
  new URL("results.json", reportDir),
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      clip: "tests/fixtures/street-traffic.mp4",
      records,
    },
    null,
    2,
  ),
);
console.log(
  `${records.length - failures}/${records.length} integration checks passed; inspect .local/real-video/results.json and compare with the frames. Visual accuracy requires separate review.`,
);
process.exitCode = failures ? 1 : 0;

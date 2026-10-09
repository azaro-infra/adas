import assert from "node:assert/strict";
import test from "node:test";
import { runAgent } from "../src/lib/agent";
import { analysisInputSchema, type AnalysisInput } from "../src/lib/contracts";

const input: AnalysisInput = {
  image: "/9j/".repeat(10),
  capturedAt: new Date().toISOString(),
  videoTime: 1,
  question: "Set cabin to 20 °C.",
  mode: "ask",
  vehicle: { speedKph: 0, batteryPercent: 76, cabinTemperature: 22 },
  history: [],
};

test("adapter sends context to the local NeMo service and validates returned state", async () => {
  const result = await runAgent(input, undefined, async (url, init) => {
    assert.equal(url, "http://127.0.0.1:8000/analyze");
    assert.deepEqual(JSON.parse(init!.body as string), input);
    return Response.json({
      output: { answer: "Applied.", observations: [], uncertainty: "" },
      vehicle: { ...input.vehicle, cabinTemperature: 20 },
      toolExecutions: [
        {
          name: "set_cabin_temperature",
          arguments: { temperature: 20 },
          result: { applied: true },
          status: "completed",
          durationMs: 0,
        },
      ],
      capturedAt: input.capturedAt,
      videoTime: 1,
      model: "local",
      framework: "NVIDIA NeMo Agent Toolkit",
      metrics: { totalMs: 100, modelMs: 90, modelCalls: 2, toolCalls: 1 },
      trace: [],
    });
  });
  assert.equal(result.vehicle.cabinTemperature, 20);
  assert.equal(input.vehicle.cabinTemperature, 22);
});

test("malformed backend responses cannot update simulation state", async () => {
  await assert.rejects(
    runAgent(input, undefined, async () => Response.json({ answer: "Done" })),
    /invalid response/,
  );
});

test("backend failure propagates without fabricating a model answer", async () => {
  await assert.rejects(
    runAgent(input, undefined, async () =>
      Response.json({ detail: "Agent failed" }, { status: 502 }),
    ),
    /Agent failed/,
  );
});

test("cancellation is forwarded to the backend", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runAgent(input, controller.signal, async (_url, init) => {
      assert.equal(init?.signal?.aborted, true);
      init!.signal!.throwIfAborted();
      throw new Error("unreachable");
    }),
    { name: "AbortError" },
  );
});

test("oversized images, histories, and invalid telemetry fail validation", () => {
  assert.equal(analysisInputSchema.safeParse(input).success, true);
  for (const invalid of [
    { ...input, image: "A".repeat(1_500_001) },
    { ...input, vehicle: { ...input.vehicle, speedKph: -1 } },
    { ...input, history: Array(7).fill({ role: "user", content: "Hi" }) },
  ])
    assert.equal(analysisInputSchema.safeParse(invalid).success, false);
});

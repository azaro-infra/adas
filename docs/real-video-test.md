# Real-video agent test — 2026-09-30

**All four integration checks passed. Visual recognition was broadly useful, with small-text errors and unsupported motion wording.** This is a qualitative spot check, not a perception benchmark.

## Footage and reproduction

35 seconds of real San Francisco street traffic by Editor, licensed CC BY 3.0. The local MP4 is resized to 768×432 and has no audio. It is a street-level fixed viewpoint, not footage from an onboard dashcam. [Source and attribution](../tests/fixtures/STREET-TRAFFIC-SOURCE.md).

With Ollama, the NeMo backend, and Next.js running:

```bash
npm run test:video
```

The script sends JPEGs extracted at **3, 15, and 28 seconds** through Next.js → NVIDIA NeMo Agent Toolkit 1.9.0 → local Qwen3-VL 4B instruct. No model responses are mocked. It writes complete answers, actual tool calls/results, traces, and metrics to `.local/real-video/results.json`. Human reference notes were written after inspecting the images and before seeing model answers.

## Observations

**3 seconds — scene inspection, 12.62 s.** The agent correctly identified the prominent Skyline truck, buses, rails, trees, overhead street infrastructure, and red signal. It added uncertain small-text details (the advertising transcription “WALKSHOPE”) and described a bus as “stopped,” despite being asked not to infer motion. Main object recognition was useful; precise OCR and motion wording were not reliable.

**15 seconds — foreground road users, 8.61 s.** It identified the red-helmeted cyclist on the left, red taxi on the right, central bus, tracks, and wires. It read the bus destination as “SAM BRUNO” rather than the visible “SAN BRUNO.” “Rides” is also stronger temporal wording than a single image establishes.

**28 seconds — scene plus simulated telemetry, 7.71 s.** It identified buses, cars/taxis, people in the roadway, and the cropped red-helmeted person. It qualified the signal description as red “for some directions,” appropriate to a scene containing different signal colors. It called `read_vehicle_status` and correctly reported **76%**, sourced from the simulator rather than guessed from the image.

**15 seconds — scene plus temperature action, 5.72 s.** It invoked `inspect_frame` and `set_cabin_temperature`, returned actual `applied: true` state at **20 °C**, then produced a final model answer referring to the scene and completed simulation action.

Each request used three model calls: agent tool selection, vision inside `inspect_frame`, and agent final response. The first two used one tool; the last two used two tools. These individual latencies are sensitive to loading and caches; later requests were warmer and the fourth reused the 15-second image.

## What passed and what needs work

The executable checks verify successful native tool execution, a final model call after tool results, unchanged simulation for observation/read requests, correct battery retrieval, and the explicit temperature change. They deliberately do not equate HTTP success or valid JSON with correct vision.

This clip demonstrates meaningful scene differences across sampled times: a prominent truck early, a cyclist and taxi at 15 seconds, then pedestrians and a cropped cyclist later. The system still analyzes separate still frames; it does not track those objects through time. To improve the next evaluation, use several viewpoints and lighting conditions, score object/OCR claims against manually reviewed frames, and specifically measure unsupported motion claims. Prompt instructions alone did not eliminate them in this test.

## Browser check

The real MP4 was also loaded through the dashboard’s file picker. A browser-captured frame at approximately 32.2 seconds produced an actual `inspect_frame` result, a final model answer, and NeMo trace in **9.74 seconds**. The clip and result were left loaded in the dashboard. That additional answer included motion wording and detailed pedestrian descriptions; those details were not separately validated, so this browser check demonstrates the capture/inference/UI path only.

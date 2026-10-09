# Local in-vehicle AI demo: research and implementation

Updated 2026-09-30 for MacBook Pro M5, 24 GB unified memory. The user chose to move the initial TypeScript action dispatcher closer to NVIDIA’s architecture. The current version uses actual NVIDIA NeMo Agent Toolkit orchestration with local Ollama inference. Setup and file walkthrough: [README](../README.md).

## What the NVIDIA article provides

The article describes a cabin assistant combining camera/audio/telemetry context, speech recognition, orchestration, language or vision-language inference, tools, memory, and speech synthesis. Optional cloud agents extend local assistance. Deployment options include a separate DRIVE AI Box and consolidated DRIVE systems. Its links identify building blocks rather than a complete Next.js demo. Its automotive latency targets are not Mac benchmarks. [NVIDIA article](https://developer.nvidia.com/blog/how-to-build-in-vehicle-ai-agents-with-nvidia-from-cloud-to-car/)

TensorRT Edge-LLM is an inference runtime targeting NVIDIA hardware. Its support matrix includes NVIDIA Jetson, DRIVE, DGX Spark, IGX, and Linux GPU configurations; it does not provide an Apple Silicon/macOS runtime. This project therefore substitutes Ollama/Metal for that layer. [Runtime repository](https://github.com/NVIDIA/TensorRT-Edge-LLM), [support matrix](https://nvidia.github.io/TensorRT-Edge-LLM/latest/user_guide/getting_started/support-matrix.html)

NeMo Agent Toolkit is a separate application-level toolkit. Its configuration describes functions, LLMs, and workflows. It can be used independently of the NVIDIA automotive inference stack. This implementation installs `nvidia-nat`, `nvidia-nat-langchain[openai]`, and `nvidia-nat-profiler`, pinned to 1.9.0, in a Python 3.12 environment and runs them successfully on this Mac. [NVIDIA toolkit repository](https://github.com/NVIDIA/NeMo-Agent-Toolkit), [NVIDIA toolkit package](https://pypi.org/project/nvidia-nat/1.9.0/)

## Current architecture and substitutions

- **NVIDIA software used:** workflow loading, configuration, function registration, the built-in `tool_calling_agent`, and profiler events. The agent uses its LangChain/LangGraph implementation internally.
- **Local inference:** native Ollama with `qwen3-vl:4b-instruct` on Apple Silicon. The NeMo OpenAI provider is configured with `http://127.0.0.1:11434/v1`, a local protocol adapter, and a dummy credential. It does not use OpenAI’s hosted service.
- **Vision tool:** `inspect_frame` calls Ollama’s native `/api/chat` with one JPEG, then returns the observation to the agent. The same model serves both reasoning and vision roles.
- **Vehicle tools:** `read_vehicle_status` reads request-scoped simulation state; `set_cabin_temperature` changes a copied state after policy validation. No vehicle hardware is connected.
- **Frontend:** Next.js plays local video/camera input and shows actual tool arguments/results, state, timings, and NeMo events.
- **Omitted:** speech input/output, cloud agents, NVIDIA inference engines, temporal tracking, and vehicle deployment.

This is closer to the article’s application architecture than the original structured-JSON dispatcher: NVIDIA’s agent now controls the native tool-call → execution → tool-result → model loop. It is not a claim that this is the single closest possible non-NVIDIA implementation. It is a tested, approachable starting point under the local-only Mac constraint.

## Why this model/runtime

Ollama supports Apple M-series execution on macOS; native execution supports Apple GPU acceleration, while Docker Desktop on macOS does not provide the same Ollama GPU path. The 4B instruct package is approximately 3.3 GB with vision and tool capabilities. This made it a reasonable starting candidate, not a proven optimum. [Ollama macOS requirements](https://docs.ollama.com/macos), [Ollama FAQ](https://docs.ollama.com/faq), [model package](https://ollama.com/library/qwen3-vl:4b-instruct), [Qwen model card](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct)

The app accepts only the local 2B, 4B, and 8B instruct tags; only 4B was verified in this migration. Model download size is not runtime RAM. Context, vision processing, runtime allocations, macOS, and the browser all consume unified memory. Measure memory pressure and `ollama ps` before increasing model size. [2B](https://ollama.com/library/qwen3-vl:2b-instruct), [4B](https://ollama.com/library/qwen3-vl:4b-instruct), [8B](https://ollama.com/library/qwen3-vl:8b-instruct)

During the earlier local integration, the generic `qwen3-vl:4b` tag returned schema-constrained content through its thinking field, leaving the answer empty. The project uses the explicit instruct tag and does not display thinking as an answer. This was an observation on Ollama 0.32.5, not a general statement about all versions. The current native-tool loop no longer uses the earlier JSON action-proposal schema.

## Frames, tools, and state

Ollama’s vision REST API takes base64 image data in a message’s `images` field. This demo captures a still JPEG, up to 768 pixels on its longest edge. It does not send the browser’s video stream to the model. Automatic observation waits eight seconds after completion before capturing again. [Vision API](https://docs.ollama.com/capabilities/vision)

Tool calling is a separate protocol: the model selects a named tool with arguments, application code runs it, and its result returns to the model. A sentence claiming an action happened is not proof of execution. The dashboard displays actual tool results and applies only the validated returned simulator state. [Ollama tool-calling documentation](https://docs.ollama.com/capabilities/tool-calling)

The explicit temperature policy permits 16–28 °C only, requires a direct English request matching the numeric target, rejects Fahrenheit and negation, and blocks all writes in observation mode. These are small learning-demo rules, not general natural-language authorization or a real vehicle control policy. Tool execution mutates only a request-local copy; failed/cancelled requests never commit browser state.

## Reading the NVIDIA code

Start with this project’s `backend/configs/cabin.yml` and registered functions in `backend/cabin_agent/tools.py`. Follow `load_workflow` and `manager.run` in `server.py` into the installed toolkit. Useful modules in the pinned package are:

- `nat/runtime/loader.py`: workflow loading.
- `nat/builder/function_info.py`: typed function registration.
- `nat/plugins/langchain/agent/tool_calling_agent/register.py`: built-in workflow and iteration limits.
- `nat/plugins/langchain/agent/tool_calling_agent/agent.py`: graph and native tool handling.
- `nat/plugins/langchain/callback_handler.py`: model/tool profiler events.

Those installed sources were inspected during implementation and the real workflow is exercised by the tests. The profiler package is required here: without it, the initial run emitted only workflow-level events, so model-call counts would have been incomplete.

Read TensorRT Edge-LLM afterward to study inference deployment: `cpp/builder`, `cpp/runtime`, `cpp/multimodal`, `cpp/tokenizer`, and `examples` expose that layer’s boundaries. [C++ source](https://github.com/NVIDIA/TensorRT-Edge-LLM/tree/main/cpp), [examples](https://github.com/NVIDIA/TensorRT-Edge-LLM/tree/main/examples)

## Local verification

The full HTTP path—Next.js → NeMo → local Ollama—passed `npm run test:local` on this Mac with Ollama 0.32.5 and Qwen3-VL 4B instruct:

- Synthetic frame + battery question: correctly read “CABIN LAB” and 76%. **2.60 seconds**, **3 model calls**, **2 tool calls** on a warmed run.
- Explicit 20 °C request: invoked the temperature tool, received `applied: true`, returned the actual 20 °C state and a final answer. **1.39 seconds**, **2 model calls**, **1 tool call**.
- The earlier cold/less-warm NeMo scene run took **8.14 seconds**. Repeated prompts can benefit from caches; these individual timings are not a general benchmark or a comparison with NVIDIA hardware.
- All **19 automated tests** passed (12 Python, 7 TypeScript), along with type checking and the production build. Python workflow tests run NVIDIA’s real graph and tools with scripted model outputs; the real-model smoke test uses no model mock.
- The browser flow was verified by uploading the supplied MP4 and submitting the 20 °C request: the visible simulator changed from 22 °C to 20 °C, with two model events around the temperature-tool event. Webcam permission handling was not retested.

The displayed request time comes from the Python workflow. Model counts combine NeMo LLM events with vision calls inside `inspect_frame`; trace durations overlap, and are not additive. Token rates and model load time from the earlier dispatcher were removed from the UI because they do not summarize this multi-call workflow correctly.

No runtime tracing exporter is configured. NAT telemetry and LangSmith tracing are disabled; all configured model URLs are loopback. Start Ollama with `OLLAMA_NO_CLOUD=1`. Dependencies and weights need internet only for initial installation/download. [Ollama local operation](https://docs.ollama.com/faq)

These simple integration checks establish that the application/tool loop works. They do not establish road-scene accuracy, sustained video performance, peak RAM, or driving suitability. Next useful experiments are a small set of varied clips, tool-selection failures, blurry/absent objects, then local speech or synchronized telemetry replay.

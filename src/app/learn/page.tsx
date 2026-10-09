import Link from "next/link";

const files = [
  [
    "backend/configs/cabin.yml",
    "Configure the agent",
    "Start here. Selects the local model, registered tools, system prompt, and NVIDIA’s built-in tool_calling_agent workflow.",
  ],
  [
    "backend/cabin_agent/tools.py",
    "Define capabilities",
    "Registers inspect_frame, read_vehicle_status, and set_cabin_temperature with NeMo. Temperature writes require a matching explicit request and remain simulated.",
  ],
  [
    "backend/cabin_agent/vision.py",
    "Inspect the frame",
    "The vision tool sends one captured JPEG to local Ollama. Its observation returns to the agent as a tool result.",
  ],
  [
    "backend/cabin_agent/server.py + models.py",
    "Run and inspect NeMo",
    "Owns workflow lifecycle, copied simulation state, input validation, cancellation, and actual NeMo model/tool events.",
  ],
  [
    "src/lib/agent.ts + contracts.ts",
    "Connect Python to Next.js",
    "A small HTTP adapter and validated response contract. The agent loop runs inside NeMo, behind this boundary.",
  ],
  [
    "src/components/video-feed.tsx",
    "Capture",
    "Plays a local file or webcam. A canvas resizes one frame to at most 768 pixels and encodes it as JPEG.",
  ],
  [
    "src/components/dashboard.tsx",
    "Show the results",
    "Sends frame, question, simulation, and short text history. Applies successful returned state and displays actual tool inputs, results, and timings.",
  ],
];

export default function Learn() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark">C</span>CABIN / LAB
        </Link>
        <nav>
          <Link href="/">Workbench</Link>
          <span className="nav-active">How it works</span>
        </nav>
        <span className="local-badge">A GUIDE TO THE CODE</span>
      </header>
      <main className="learn-page">
        <span className="eyebrow">
          NVIDIA NEMO AGENT TOOLKIT / LOCAL INFERENCE
        </span>
        <h1>Watch the tools close the loop.</h1>
        <p className="intro">
          The actual NVIDIA NeMo Agent Toolkit chooses tools, executes them, and
          returns their results to the model. Qwen3-VL runs locally through
          Ollama on your laptop; vehicle controls are simulated.
        </p>
        <section className="panel learn-section">
          <h2>Start on macOS or Windows</h2>
          <p>
            Install Git, native Ollama, Node.js 22 or 24 LTS, and uv. Follow the{" "}
            <a href="https://github.com/azaro-infra/adas/blob/main/docs/INSTALL.md">
              laptop installation guide
            </a>{" "}
            for platform-specific setup. In Windows PowerShell, use npm.cmd in
            place of npm.
          </p>
          <pre>{`# One-time setup\ngit clone https://github.com/azaro-infra/adas.git\ncd adas\nnpm ci\nuv sync --project backend --locked\n\n# Open each terminal in the cloned adas directory.\n# Terminal 1 — quit the Ollama app first\nnpm run ollama\n\n# Terminal 2 — download the model once, then start the agent\nollama pull qwen3-vl:4b-instruct\nnpm run agent\n\n# Terminal 3 — dashboard, port 3000\nnpm run dev`}</pre>
          <p>
            The 4B package is about 3.3 GB; runtime memory is higher. Native
            Ollama uses your supported GPU or CPU. No API key or cloud model is
            needed. Open http://127.0.0.1:3000 after the services start.
          </p>
        </section>
        <section className="learn-section">
          <h2>Read the project in this order</h2>
          <p>
            Follow the configuration into its tools, then trace a request from
            the browser through the Python workflow.
          </p>
          <div className="code-map">
            {files.map(([path, title, description], i) => (
              <article key={path}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <code>{path}</code>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="panel learn-section">
          <h2>Try three small experiments</h2>
          <ol>
            <li>
              <strong>Vision as a tool.</strong> Choose the supplied
              test-clip.mp4 or your own video. Ask what text is visible. Inspect
              the inspect_frame result and the final model answer.
            </li>
            <li>
              <strong>Read current state.</strong> Move the battery slider and
              ask for its value. The agent calls read_vehicle_status before
              answering.
            </li>
            <li>
              <strong>Complete an action.</strong> Ask “Set the cabin
              temperature to 20 °C.” The tool updates a simulation copy, returns
              its actual result to the model, and the dashboard applies the
              returned state after success.
            </li>
          </ol>
          <p>
            Open “Result returned to the model” for each tool, then compare it
            with the execution trace. A simple action needs a model call to
            choose the tool and another to interpret its result.
          </p>
        </section>
        <section className="learn-section learn-columns">
          <div>
            <h2>What comes from NVIDIA?</h2>
            <p>
              NeMo Agent Toolkit 1.9.0 provides workflow loading, function
              registration, its built-in tool-calling agent, and profiler
              events. This is the real installed Python toolkit.
            </p>
            <p>
              The model provider’s OpenAI-compatible API points to local Ollama.
              The model itself is Qwen3-VL. DriveOS and TensorRT Edge-LLM are
              not part of this demo. Ollama chooses a local inference backend
              for your hardware.
            </p>
          </div>
          <div>
            <h2>What is simulated or limited?</h2>
            <p>
              Speed, battery, and cabin temperature are session state. Automatic
              observation is read-only and waits eight seconds after each
              result. Images are sampled still frames, with no tracking or real
              vehicle control.
            </p>
            <p>
              Cancelled or failed requests discard their simulation changes.
              Valid tool calls do not guarantee a correct visual answer. Test
              your own clips and watch memory pressure before trying a larger
              model.
            </p>
          </div>
        </section>
        <section className="panel learn-section">
          <h2>Build from here</h2>
          <p>
            Add a registered tool in tools.py and list it in cabin.yml. Update
            the response allowlist and test the complete tool-result round trip.
            Next experiments could add local speech, synchronized telemetry
            replay, or a separate detector/tracker.
          </p>
          <p>
            README.md contains the full walkthrough and test commands.
            docs/research.md records primary sources and local verification.
          </p>
          <div className="source-links">
            <a
              href="https://developer.nvidia.com/blog/how-to-build-in-vehicle-ai-agents-with-nvidia-from-cloud-to-car/"
              target="_blank"
              rel="noreferrer"
            >
              NVIDIA architecture article
            </a>
            <a
              href="https://github.com/NVIDIA/NeMo-Agent-Toolkit"
              target="_blank"
              rel="noreferrer"
            >
              NeMo Agent Toolkit source
            </a>
            <a
              href="https://docs.ollama.com/capabilities/tool-calling"
              target="_blank"
              rel="noreferrer"
            >
              Ollama tool calling
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

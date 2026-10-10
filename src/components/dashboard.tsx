"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisInput,
  AnalysisResult,
  ModelStatus,
  Vehicle,
} from "@/lib/contracts";
import {
  VideoFeed,
  type CapturedFrame,
  type VideoFeedHandle,
} from "./video-feed";

const INITIAL_VEHICLE: Vehicle = {
  speedKph: 0,
  batteryPercent: 76,
  cabinTemperature: 22,
};
const OBSERVE_PROMPT =
  "Describe the visible scene. Mention readable signs and relevant objects; be clear about what cannot be determined.";

export function Dashboard() {
  const video = useRef<VideoFeedHandle>(null);
  const controller = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const inFlight = useRef(false);
  const history = useRef<AnalysisInput["history"]>([]);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [question, setQuestion] = useState("");
  const [vehicle, setVehicle] = useState<Vehicle>(INITIAL_VEHICLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"trace" | "json">("trace");

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/status");
      setStatus(await response.json());
    } catch {
      setStatus({
        ready: false,
        model: "unavailable",
        message: "Cannot reach the Next.js server.",
      });
    }
  }, []);
  useEffect(() => {
    void refreshStatus();
    return () => controller.current?.abort();
  }, [refreshStatus]);

  const resetSource = useCallback(() => {
    controller.current?.abort();
    requestNumber.current += 1;
    inFlight.current = false;
    history.current = [];
    setBusy(false);
    setAuto(false);
    setResult(null);
    setFrame(null);
    setError("");
  }, []);

  const analyze = useCallback(
    async (mode: "ask" | "observe", override?: string) => {
      if (inFlight.current) return;
      const prompt =
        mode === "observe" ? OBSERVE_PROMPT : (override || question).trim();
      if (!prompt) {
        setError("Type a question about the frame first.");
        return;
      }
      const current = ++requestNumber.current;
      try {
        const capture = video.current?.capture();
        if (!capture) throw new Error("Choose a video source first.");
        inFlight.current = true;
        setBusy(true);
        setError("");
        setFrame(capture);
        setResult(null);
        setSubmittedQuestion(prompt);
        controller.current = new AbortController();
        const input: AnalysisInput = {
          ...capture,
          question: prompt,
          mode,
          vehicle,
          history: mode === "ask" ? history.current : [],
        };
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.current.signal,
        });
        const data = await response.json();
        if (current !== requestNumber.current) return;
        if (!response.ok) throw new Error(data.error || "Analysis failed.");
        setResult(data);
        setVehicle(data.vehicle);
        if (mode === "ask")
          history.current = [
            ...history.current,
            { role: "user", content: prompt },
            { role: "assistant", content: data.output.answer.slice(0, 2000) },
          ].slice(-6) as AnalysisInput["history"];
      } catch (failure) {
        if (current !== requestNumber.current) return;
        if (failure instanceof Error && failure.name !== "AbortError") {
          setError(failure.message);
          setAuto(false);
        }
      } finally {
        if (current === requestNumber.current) {
          inFlight.current = false;
          setBusy(false);
        }
      }
    },
    [question, vehicle],
  );

  // Wait eight seconds AFTER completion. Never accumulate a queue of stale frames.
  useEffect(() => {
    if (!auto || busy || !ready || !status?.ready) return;
    const timer = setTimeout(() => void analyze("observe"), 8000);
    return () => clearTimeout(timer);
  }, [auto, busy, ready, status?.ready, analyze]);

  const canAnalyze = ready && status?.ready && !busy;
  const seconds = (value: number) => `${(value / 1000).toFixed(1)} s`;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">C</span>
          <span>
            CABIN<span className="brand-light"> ASSISTANT</span>
          </span>
        </Link>
        <nav>
          <span className="nav-active">Workbench</span>
          <Link href="/learn">How it works</Link>
        </nav>
        <span className="local-badge">ON-DEVICE AI</span>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <span className="eyebrow">IN-VEHICLE AI / LOCAL EXPERIMENT</span>
            <h1>See the scene. Follow the agent.</h1>
            <p>
              A small, inspectable cabin assistant. Video in, local intelligence
              out.
            </p>
          </div>
          <div className="model-status">
            <span className={`status-dot ${status?.ready ? "online" : ""}`} />
            <div>
              <strong>{status?.model || "Checking local model…"}</strong>
              <span>
                {status?.ready
                  ? "NeMo Agent Toolkit · local Ollama"
                  : "Setup required"}
              </span>
            </div>
            <button
              className="text-button"
              onClick={refreshStatus}
              aria-label="Refresh model status"
            >
              Refresh
            </button>
          </div>
        </div>
        {status && !status.ready && (
          <aside className="setup-banner">
            <strong>Connect the local model</strong>
            <code>{status.message}</code>
            <span>
              Then click Refresh. First-time setup is in{" "}
              <Link href="/learn">How it works</Link>.
            </span>
          </aside>
        )}
        <div className="workspace">
          <div className="left-column">
            <VideoFeed
              ref={video}
              onSourceChange={resetSource}
              onReady={setReady}
            />
            <section className="panel telemetry">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">CONTEXT</span>
                  <h2>Vehicle state</h2>
                </div>
                <span className="tag amber">SIMULATED</span>
              </div>
              <div className="telemetry-grid">
                <label>
                  <span>Speed</span>
                  <strong>
                    {vehicle.speedKph}
                    <small> km/h</small>
                  </strong>
                  <input
                    aria-label="Simulated speed"
                    type="range"
                    min="0"
                    max="130"
                    value={vehicle.speedKph}
                    disabled={busy}
                    onChange={(e) =>
                      setVehicle({
                        ...vehicle,
                        speedKph: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Battery</span>
                  <strong>
                    {vehicle.batteryPercent}
                    <small> %</small>
                  </strong>
                  <input
                    aria-label="Simulated battery"
                    type="range"
                    min="0"
                    max="100"
                    value={vehicle.batteryPercent}
                    disabled={busy}
                    onChange={(e) =>
                      setVehicle({
                        ...vehicle,
                        batteryPercent: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <div>
                  <span>Cabin temperature</span>
                  <strong>
                    {vehicle.cabinTemperature}
                    <small> °C</small>
                  </strong>
                  <span className="muted">Ask the agent to change it</span>
                </div>
              </div>
            </section>
            <section className="panel pipeline-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">THE LOOP</span>
                  <h2>A tool loop, on your laptop</h2>
                </div>
                <Link href="/learn">Read the code map</Link>
              </div>
              <div className="pipeline">
                <span>
                  <b>01</b>Capture frame
                </span>
                <span>
                  <b>02</b>NeMo agent
                </span>
                <span>
                  <b>03</b>Execute tools
                </span>
                <span>
                  <b>04</b>Model reads results
                </span>
              </div>
              <p className="muted">
                This demo analyzes still frames. It does not track objects or
                control a vehicle.
              </p>
            </section>
          </div>
          <div className="right-column">
            <section className="panel assistant-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">02 / UNDERSTAND</span>
                  <h2>Ask your cabin assistant</h2>
                </div>
                <span className="tag">VISION + TEXT</span>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void analyze("ask");
                }}
              >
                <label className="sr-only" htmlFor="question">
                  Question about this frame
                </label>
                <textarea
                  id="question"
                  maxLength={800}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What can you see in this frame?"
                  rows={3}
                />
                <div className="prompt-examples">
                  <button
                    type="button"
                    onClick={() =>
                      setQuestion("What signs can you read in this frame?")
                    }
                  >
                    Read the signs
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setQuestion("Set the cabin temperature to 20 °C.")
                    }
                  >
                    Set cabin to 20 °C
                  </button>
                </div>
                <div className="analysis-actions">
                  <button
                    className="primary"
                    disabled={!canAnalyze || !question.trim()}
                    type="submit"
                  >
                    Ask about frame
                  </button>
                  <button
                    disabled={!canAnalyze}
                    type="button"
                    onClick={() => void analyze("observe")}
                  >
                    Analyze frame
                  </button>
                </div>
              </form>
              <label className="auto-control">
                <input
                  type="checkbox"
                  checked={auto}
                  disabled={!ready || !status?.ready}
                  onChange={(e) => setAuto(e.target.checked)}
                />
                <span>
                  Observe automatically
                  <small>Next frame 8 seconds after each result</small>
                </span>
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="response-area" aria-live="polite">
                {busy ? (
                  <div className="working">
                    <span className="spinner" />
                    <strong>Running the local NeMo agent…</strong>
                    <p>
                      The first request also loads the model. Later requests are
                      usually faster.
                    </p>
                    <button
                      onClick={() => {
                        controller.current?.abort();
                        requestNumber.current += 1;
                        inFlight.current = false;
                        setBusy(false);
                        setAuto(false);
                        setError(
                          "Request cancelled. You can capture another frame.",
                        );
                      }}
                    >
                      Cancel request
                    </button>
                  </div>
                ) : result ? (
                  <>
                    <div className="response-caption">
                      ASSISTANT RESPONSE{" "}
                      <span>
                        {new Date(result.capturedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="answer">{result.output.answer}</p>
                    <ul className="observations">
                      {result.output.observations.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                    {result.output.uncertainty && (
                      <p className="uncertainty">{result.output.uncertainty}</p>
                    )}
                    {result.toolExecutions.map((tool, index) => (
                      <div
                        className="action-proposal"
                        key={`${tool.name}-${index}`}
                      >
                        <span className="eyebrow">
                          TOOL {tool.status.toUpperCase()}
                        </span>
                        <strong>{tool.name}</strong>
                        <p>{JSON.stringify(tool.arguments)}</p>
                        <details>
                          <summary>Result returned to the model</summary>
                          <pre
                            style={{
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {JSON.stringify(tool.result, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="response-empty">
                    <span className="small-cross">+</span>
                    <strong>Ready for your first observation</strong>
                    <p>
                      1. Choose a video source
                      <br />
                      2. Pause on an interesting frame
                      <br />
                      3. Analyze it or ask a question
                    </p>
                  </div>
                )}
              </div>
            </section>
            <section className="panel metrics">
              <div>
                <span>Request time</span>
                <strong>
                  {result ? seconds(result.metrics.totalMs) : "—"}
                </strong>
              </div>
              <div>
                <span>Model calls</span>
                <strong>{result ? result.metrics.modelCalls : "—"}</strong>
              </div>
              <div>
                <span>Tool calls</span>
                <strong>{result ? result.metrics.toolCalls : "—"}</strong>
              </div>
            </section>
          </div>
        </div>
        <section className="panel inspector">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">03 / INSPECT</span>
              <h2>Open the black box</h2>
            </div>
            <div className="tabs">
              <button
                aria-pressed={tab === "trace"}
                onClick={() => setTab("trace")}
              >
                Execution trace
              </button>
              <button
                aria-pressed={tab === "json"}
                onClick={() => setTab("json")}
              >
                Response JSON
              </button>
            </div>
          </div>
          <div className="inspector-body">
            <div className="sample-frame">
              {frame ? (
                <>
                  <img
                    src={`data:image/jpeg;base64,${frame.image}`}
                    alt="Exact sampled frame sent to the local model"
                  />
                  <span>
                    Sample at {frame.videoTime.toFixed(1)} s ·{" "}
                    {new Date(frame.capturedAt).toLocaleTimeString()}
                  </span>
                </>
              ) : (
                <div className="sample-empty">
                  The exact frame sent to the model appears here.
                </div>
              )}
            </div>
            <div className="trace-content">
              {tab === "json" ? (
                <pre>
                  {result
                    ? JSON.stringify(result, null, 2)
                    : "// Run an analysis to inspect the actual response."}
                </pre>
              ) : result ? (
                <>
                  <div className="submitted-question">{submittedQuestion}</div>
                  {result.trace.map((step, index) => (
                    <div className="trace-step" key={`${step.step}-${index}`}>
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <div>
                        <strong>{step.step}</strong>
                        <p>{step.detail}</p>
                      </div>
                      <span>{step.durationMs} ms</span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="trace-empty">
                  <strong>
                    {busy
                      ? "Local inference in progress"
                      : "Every result has a trail."}
                  </strong>
                  <p>
                    {busy
                      ? "The trace will appear when the model returns."
                      : "See actual NeMo model and tool events, with measured timings. Tool results appear above and in the JSON inspector."}
                  </p>
                  <code>capture → NeMo → tools → model → answer</code>
                </div>
              )}
            </div>
          </div>
        </section>
        <footer>
          <span>
            CABIN ASSISTANT{" "}
            <span className="muted">
              · NVIDIA NeMo Agent Toolkit + local Ollama
            </span>
          </span>
          <span>Local inference · Session-only data</span>
        </footer>
      </main>
    </div>
  );
}

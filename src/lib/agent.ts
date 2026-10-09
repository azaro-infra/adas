import {
  analysisResultSchema,
  type AnalysisInput,
  type AnalysisResult,
  type ModelStatus,
} from "./contracts";

// The actual agent loop lives in NVIDIA NeMo Agent Toolkit. This adapter only
// forwards validated requests to our loopback-only Python service.
const BACKEND = "http://127.0.0.1:8000";

export async function runAgent(
  input: AnalysisInput,
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<AnalysisResult> {
  const timeout = AbortSignal.timeout(190_000);
  const response = await transport(`${BACKEND}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : body.error || "Local NeMo workflow failed.",
    );
  }
  const result = analysisResultSchema.safeParse(body);
  if (!result.success)
    throw new Error("The local agent returned an invalid response.");
  return result.data;
}

export async function getStatus(): Promise<ModelStatus> {
  try {
    const response = await fetch(`${BACKEND}/health`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Backend health check failed.");
    return await response.json();
  } catch {
    return {
      ready: false,
      model: "NeMo agent unavailable",
      message: "Start the NVIDIA NeMo backend: npm run agent",
    };
  }
}

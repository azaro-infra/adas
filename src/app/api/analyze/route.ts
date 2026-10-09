import { analysisInputSchema } from "@/lib/contracts";
import { runAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 200;
let busy = false;

export async function POST(request: Request) {
  // The UI and API share one origin; foreign browser pages cannot invoke inference.
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const source = new URL(origin);
      // Next.js can normalize request.url to localhost even when the browser
      // uses 127.0.0.1. Compare against the actual incoming Host header instead.
      if (
        source.protocol !== "http:" ||
        !["127.0.0.1", "localhost", "[::1]"].includes(source.hostname) ||
        source.host !== request.headers.get("host")
      ) {
        return Response.json(
          { error: "Same-origin localhost requests only." },
          { status: 403 },
        );
      }
    } catch {
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
  }
  if (busy)
    return Response.json(
      { error: "The model is working on another frame. Try again shortly." },
      { status: 429 },
    );
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json(
      { error: "Expected application/json." },
      { status: 415 },
    );
  }
  // Bound the stream before JSON parsing, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "Missing request body." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  let input;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1_600_000) {
        await reader.cancel();
        return Response.json(
          { error: "Frame too large. Use the browser's resized capture." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    input = analysisInputSchema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!input.success)
    return Response.json(
      { error: "Invalid frame, question, or telemetry." },
      { status: 400 },
    );
  const jpeg = Buffer.from(input.data.image, "base64");
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) {
    return Response.json({ error: "Expected a JPEG frame." }, { status: 400 });
  }
  // Check again after body reads: another request may have acquired the model.
  if (busy)
    return Response.json(
      { error: "The model is busy. Try again shortly." },
      { status: 429 },
    );
  busy = true;
  try {
    return Response.json(await runAgent(input.data, request.signal));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Local inference failed.";
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json(
      {
        error: timeout
          ? "Agent timed out. Try a simpler question or frame."
          : message === "fetch failed"
            ? "Cannot reach the NeMo backend. Start it with npm run agent."
            : message,
      },
      { status: timeout ? 504 : 502 },
    );
  } finally {
    busy = false;
  }
}

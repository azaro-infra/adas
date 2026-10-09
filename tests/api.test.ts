import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/analyze/route";

test("127.0.0.1 browser origin survives Next.js URL normalization", async () => {
  const response = await POST(
    new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: "{}",
    }),
  );
  // Reaches payload validation, rather than rejecting a legitimate origin.
  assert.equal(response.status, 400);
});

test("foreign origins and different ports cannot invoke the model", async () => {
  for (const origin of [
    "https://example.com",
    "http://127.0.0.1:4000",
    "null",
  ]) {
    const response = await POST(
      new Request("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin,
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(response.status, 403);
  }
});

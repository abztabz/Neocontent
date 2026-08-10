import assert from "node:assert/strict";
import test from "node:test";
import { assertSameOrigin } from "./http-auth.js";

test("operator same-origin accepts matching public host even when proxy proto differs", () => {
  assert.doesNotThrow(() => assertSameOrigin({
    method: "POST",
    headers: {
      origin: "https://living-content-engine.vercel.app",
      host: "living-content-engine.vercel.app",
      "x-forwarded-proto": "http",
    },
    query: {},
    body: {},
  }));
});

test("operator same-origin accepts Vercel production URL as a host candidate", () => {
  const previous = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "living-content-engine.vercel.app";
  try {
    assert.doesNotThrow(() => assertSameOrigin({
      method: "POST",
      headers: {
        origin: "https://living-content-engine.vercel.app",
        host: "living-content-engine-kfrtwkfzx-108media.vercel.app",
      },
      query: {},
      body: {},
    }));
  } finally {
    if (previous === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = previous;
  }
});

test("operator same-origin still rejects cross-origin requests", () => {
  assert.throws(() => assertSameOrigin({
    method: "POST",
    headers: {
      origin: "https://evil.test",
      host: "living-content-engine.vercel.app",
    },
    query: {},
    body: {},
  }), /origin is invalid/i);
});

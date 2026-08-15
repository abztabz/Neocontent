import assert from "node:assert/strict";
import test from "node:test";
import handler from "../../api/v1/source-registry.js";

function responseRecorder() {
  let statusCode = 0;
  let body: unknown;
  const headers: Record<string, string | string[]> = {};
  const response = {
    status(code: number) { statusCode = code; return response; },
    setHeader(name: string, value: string | string[]) { headers[name] = value; return response; },
    json(payload: unknown) { body = payload; },
  };
  return { response, read: () => ({ statusCode, body, headers }) };
}

test("shared source registry endpoint exposes safe capability governance metadata", async () => {
  const recorder = responseRecorder();
  await handler({ method: "GET", headers: {}, query: {} }, recorder.response);
  const result = recorder.read();
  assert.equal(result.statusCode, 200);
  const serialized = JSON.stringify(result.body);
  assert.match(serialized, /neo-source-registry-v1/);
  assert.match(serialized, /company-filings/);
  assert.match(serialized, /language-translation/);
  assert.equal(serialized.includes("secretEnvName"), false);
  assert.equal(serialized.includes("NEO_COMPANIES_HOUSE_KEY"), false);
  assert.equal(result.headers["Access-Control-Allow-Origin"], "*");
});

test("shared source registry endpoint can return one declared capability", async () => {
  const recorder = responseRecorder();
  await handler({ method: "GET", headers: {}, query: { capability: "economic-data" } }, recorder.response);
  const result = recorder.read();
  assert.equal(result.statusCode, 200);
  const body = result.body as Record<string, unknown>;
  const capability = body.capability as Record<string, unknown>;
  assert.equal(capability.id, "economic-data");
  assert.equal(capability.readiness, "ready");
});

test("shared source registry endpoint rejects mutation methods and unknown capabilities", async () => {
  const mutation = responseRecorder();
  await handler({ method: "POST", headers: {}, query: {} }, mutation.response);
  assert.equal(mutation.read().statusCode, 405);

  const missing = responseRecorder();
  await handler({ method: "GET", headers: {}, query: { capability: "does-not-exist" } }, missing.response);
  assert.equal(missing.read().statusCode, 404);
});

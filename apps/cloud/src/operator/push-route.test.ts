import assert from "node:assert/strict";
import test from "node:test";
import pushHandler from "../../api/operator/push.js";
import { operatorSessionDigest } from "./auth.js";

function response() {
  return {
    statusCode: 0,
    payload: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.payload = payload; },
  };
}

test("push management rejects unauthenticated requests", async () => {
  process.env.NEO_OPERATOR_TOKEN = "T".repeat(32);
  const output = response();
  await pushHandler({ method: "POST", headers: {}, query: {}, body: {} }, output);
  assert.equal(output.statusCode, 401);
});

test("push management rejects invalid CSRF and cross-origin requests", async () => {
  const token = "T".repeat(32);
  process.env.NEO_OPERATOR_TOKEN = token;
  const cookie = `neo_operator_session=${operatorSessionDigest(token)}; neo_operator_csrf=csrf-value`;
  const badCsrf = response();
  await pushHandler({ method: "POST", headers: { cookie, origin: "https://neo.test", host: "neo.test" }, query: {}, body: { action: "test", csrf: "wrong" } }, badCsrf);
  assert.equal(badCsrf.statusCode, 400);
  const badOrigin = response();
  await pushHandler({ method: "POST", headers: { cookie, origin: "https://evil.test", host: "neo.test" }, query: {}, body: { action: "test", csrf: "csrf-value" } }, badOrigin);
  assert.equal(badOrigin.statusCode, 400);
});

test("push management rejects a non-allowlisted subscription endpoint", async () => {
  const token = "T".repeat(32);
  process.env.NEO_OPERATOR_TOKEN = token;
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  const cookie = `neo_operator_session=${operatorSessionDigest(token)}; neo_operator_csrf=csrf-value`;
  const output = response();
  await pushHandler({ method: "POST", headers: { cookie, origin: "https://neo.test", host: "neo.test" }, query: {}, body: { action: "subscribe", csrf: "csrf-value", subscription: { ...validSubscription, endpoint: "https://example.com/push" } } }, output);
  assert.equal(output.statusCode, 400);
});

const validSubscription = { endpoint: "https://web.push.apple.com/Q".padEnd(70, "x"), keys: { p256dh: "A".repeat(64), auth: "B".repeat(24) } };

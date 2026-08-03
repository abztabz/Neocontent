import test from "node:test";
import assert from "node:assert/strict";
import { signRequest, verifyRequest } from "./signatures.js";

const secret = "a-strong-test-secret-that-is-not-used-in-production";
const timestamp = "1785718800";
const now = Number(timestamp) * 1000;

 test("verifies an untampered signed request", () => {
  const signature = signRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body: '{"ok":true}' });
  assert.equal(verifyRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body: '{"ok":true}', signature, now }), true);
});

test("rejects body tampering", () => {
  const signature = signRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body: '{"ok":true}' });
  assert.equal(verifyRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body: '{"ok":false}', signature, now }), false);
});

test("rejects stale timestamps", () => {
  const signature = signRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body: "" });
  assert.equal(verifyRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body: "", signature, now: now + 301_000 }), false);
});

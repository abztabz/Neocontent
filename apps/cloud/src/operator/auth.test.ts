import test from "node:test";
import assert from "node:assert/strict";
import { operatorSessionDigest, verifyOperatorToken } from "./auth.js";

test("operator authentication accepts only the configured high-entropy token", () => {
  const expected = "a".repeat(64);
  assert.equal(verifyOperatorToken(expected, expected), true);
  assert.equal(verifyOperatorToken("b".repeat(64), expected), false);
  assert.equal(verifyOperatorToken("short", "short"), false);
});

test("operator session cookies contain a derived digest rather than the secret", () => {
  const token = "private-operator-token-which-is-long-enough";
  const session = operatorSessionDigest(token);
  assert.notEqual(session, token);
  assert.match(session, /^[0-9a-f]{64}$/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { validateSourceUrl } from "./validate-source-url.js";

test("accepts a public HTTPS source", () => {
  assert.equal(validateSourceUrl("https://www.who.int/news").hostname, "www.who.int");
});

test("rejects localhost and metadata hosts", () => {
  assert.throws(() => validateSourceUrl("http://localhost/admin"));
  assert.throws(() => validateSourceUrl("http://169.254.169.254/latest/meta-data"));
});

test("rejects URL credentials and unsafe schemes", () => {
  assert.throws(() => validateSourceUrl("https://user:pass@example.com/report"));
  assert.throws(() => validateSourceUrl("file:///etc/passwd"));
});

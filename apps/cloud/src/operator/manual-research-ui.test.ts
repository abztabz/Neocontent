import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../../api/operator/index.ts", import.meta.url), "utf8");

test("operator workspace visibly exposes the governed manual research control", () => {
  assert.match(source, />Run Research Now<\/a>/);
  assert.ok(source.includes('href="/api/operator/research-now"'));
  assert.match(source, /without changing the scheduled cadence/i);
});

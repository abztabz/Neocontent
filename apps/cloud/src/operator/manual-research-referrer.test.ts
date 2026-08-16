import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../../api/operator/manifest.ts", import.meta.url), "utf8");

test("manual research preserves same-origin referrer proof without cross-origin leakage", () => {
  assert.ok(source.includes('response.setHeader?.("referrer-policy", "same-origin")'));
  assert.equal(source.includes('response.setHeader?.("referrer-policy", "no-referrer")'), false);
});

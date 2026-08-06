import test from "node:test";
import assert from "node:assert/strict";
import { assertBrowserConnectionOrigin } from "../../api/v1/sites/register.js";

test("browser connection accepts only the registered WordPress origin", () => {
  const headers = { "x-neo-browser-connection": "1" };
  assert.doesNotThrow(() => assertBrowserConnectionOrigin(headers, "https://example.com", "https://example.com/wordpress/"));
  assert.throws(
    () => assertBrowserConnectionOrigin(headers, "https://attacker.example", "https://example.com/"),
    /origin is invalid/i,
  );
  assert.throws(
    () => assertBrowserConnectionOrigin(headers, "", "https://example.com/"),
    /origin is invalid/i,
  );
});

test("server registration does not require a browser origin", () => {
  assert.doesNotThrow(() => assertBrowserConnectionOrigin({}, "", "https://example.com/"));
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBrowserConnectionOrigin,
  browserNavigationEnvelope,
  validatedReturnUrl,
} from "../../api/v1/sites/register.js";

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

test("browser navigation envelope accepts only bounded signed fields", () => {
  const envelope = {
    schemaVersion: "neo-browser-navigation-v1",
    payload: JSON.stringify({ siteId: "123e4567-e89b-12d3-a456-426614174000" }),
    siteId: "123e4567-e89b-12d3-a456-426614174000",
    timestamp: "1786377600",
    signature: "a".repeat(64),
    returnUrl: "https://example.com/wp-admin/admin.php?page=neo-authority-settings",
    state: "A".repeat(48),
  };
  assert.deepEqual(browserNavigationEnvelope({ neo_connection_envelope: JSON.stringify(envelope) }), envelope);
  assert.deepEqual(
    browserNavigationEnvelope(`neo_connection_envelope=${encodeURIComponent(JSON.stringify(envelope))}`),
    envelope,
  );
  assert.throws(
    () => browserNavigationEnvelope({ neo_connection_envelope: JSON.stringify({ ...envelope, signature: "not-a-signature" }) }),
    /envelope is invalid/i,
  );
});

test("browser navigation returns only to the matching WordPress admin page", () => {
  assert.equal(
    validatedReturnUrl(
      "https://example.com/wordpress/wp-admin/admin.php?page=neo-authority-settings&extra=discarded",
      "https://example.com/wordpress/",
      "https://example.com/wordpress/wp-json/neo-authority/v1/publish",
    ).toString(),
    "https://example.com/wordpress/wp-admin/admin.php?page=neo-authority-settings",
  );
  assert.throws(
    () => validatedReturnUrl(
      "https://attacker.example/wp-admin/admin.php?page=neo-authority-settings",
      "https://example.com/",
      "https://example.com/wp-json/neo-authority/v1/publish",
    ),
    /return URL is invalid/i,
  );
  assert.throws(
    () => validatedReturnUrl(
      "https://example.com/wp-admin/plugin-editor.php?page=neo-authority-settings",
      "https://example.com/",
      "https://example.com/wp-json/neo-authority/v1/publish",
    ),
    /return URL is invalid/i,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { encryptSecret } from "../security/secret-vault.js";
import { verifyRequest } from "../security/signatures.js";
import { activateWordPressSite, verifyWordPressConnectionProof } from "./wordpress-connection.js";

const siteId = "11111111-1111-4111-8111-111111111111";
const siteSecret = "wordpress-test-secret-with-more-than-thirty-two-characters";

test("verifies a domain-bound WordPress connection proof", async () => {
  const origin = "https://example.com";
  const proofKey = createHmac("sha256", siteSecret).update("neo-connection-proof-v1").digest();
  const proof = createHmac("sha256", proofKey).update(`${siteId}\n${origin}`).digest("hex");
  let requestedPath = "";
  await verifyWordPressConnectionProof({
    siteId,
    siteSecret,
    websiteUrl: `${origin}/wordpress/`,
    callbackUrl: `${origin}/wordpress/wp-json/neo-authority/v1/publish`,
    businessName: "Example",
  }, async ({ url, method }) => {
    requestedPath = url.pathname;
    assert.equal(method, "GET");
    return { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ siteId, origin, proof }) };
  });
  assert.equal(requestedPath, "/wordpress/wp-json/neo-authority/v1/connection-proof");
});

test("rejects a mismatched WordPress connection proof", async () => {
  await assert.rejects(verifyWordPressConnectionProof({
    siteId,
    siteSecret,
    websiteUrl: "https://example.com/",
    callbackUrl: "https://example.com/wp-json/neo-authority/v1/publish",
    businessName: "Example",
  }, async () => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ siteId, origin: "https://example.com", proof: "attacker-proof" }),
  })), /did not match/i);
});

test("activation uses a purpose-separated signed callback without customer data", async () => {
  const previousKey = process.env.NEO_SECRET_ENCRYPTION_KEY;
  process.env.NEO_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    let activationBody = "";
    await activateWordPressSite({
      external_site_id: siteId,
      callback_url: "https://example.com/wp-json/neo-authority/v1/publish",
      encrypted_site_secret: encryptSecret(siteSecret),
    }, async ({ url, method, body, headers }) => {
      activationBody = body ?? "";
      assert.equal(url.pathname, "/wp-json/neo-authority/v1/activate");
      assert.equal(method, "POST");
      assert.equal(verifyRequest({
        secret: siteSecret,
        purpose: "cloud-activation",
        method: "POST",
        path: url.pathname,
        timestamp: headers?.["x-neo-timestamp"] ?? "",
        body: body ?? "",
        signature: headers?.["x-neo-signature"] ?? "",
      }), true);
      assert.equal(verifyRequest({
        secret: siteSecret,
        purpose: "cloud-to-wordpress",
        method: "POST",
        path: url.pathname,
        timestamp: headers?.["x-neo-timestamp"] ?? "",
        body: body ?? "",
        signature: headers?.["x-neo-signature"] ?? "",
      }), false);
      return { status: 200, contentType: "application/json", body: '{"status":"active"}' };
    });
    assert.deepEqual(JSON.parse(activationBody), { status: "active", siteId });
  } finally {
    if (previousKey === undefined) delete process.env.NEO_SECRET_ENCRYPTION_KEY;
    else process.env.NEO_SECRET_ENCRYPTION_KEY = previousKey;
  }
});

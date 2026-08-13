import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, signRequest, verifyRequest } from "./signatures.js";

const secret = "a-strong-test-secret-that-is-not-used-in-production";
const timestamp = "1785718800";
const now = Number(timestamp) * 1000;

test("canonicalizes key order, URLs, and Unicode consistently", () => {
  const first = canonicalJson({
    websiteUrl: "https://example.com/",
    siteId: "site-1",
    services: ["autism", "whole-person wellness"],
    businessName: "Clínica 日本",
  });
  const reordered = canonicalJson({
    businessName: "Clínica 日本",
    services: ["autism", "whole-person wellness"],
    siteId: "site-1",
    websiteUrl: "https://example.com/",
  });

  assert.equal(first, reordered);
  assert.equal(first.includes("https://example.com/"), true);
  assert.equal(first.includes("Clínica 日本"), true);
});

test("verifies an untampered signed request", () => {
  const body = canonicalJson({ ok: true });
  const signature = signRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body });
  assert.equal(verifyRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body, signature, now }), true);
});

test("verifies semantically identical JSON regardless of key order", () => {
  const sentBody = canonicalJson({ siteId: "site-1", websiteUrl: "https://example.com/", enabled: true });
  const parsedBody = canonicalJson({ enabled: true, websiteUrl: "https://example.com/", siteId: "site-1" });
  const signature = signRequest({ secret, method: "POST", path: "/api/v1/sites/register", timestamp, body: sentBody });

  assert.equal(
    verifyRequest({ secret, method: "POST", path: "/api/v1/sites/register", timestamp, body: parsedBody, signature, now }),
    true,
  );
});

test("rejects body tampering", () => {
  const body = canonicalJson({ ok: true });
  const signature = signRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body });
  assert.equal(verifyRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body: canonicalJson({ ok: false }), signature, now }), false);
});

test("rejects stale timestamps", () => {
  const signature = signRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body: "" });
  assert.equal(verifyRequest({ secret, method: "POST", path: "/api/v1/test", timestamp, body: "", signature, now: now + 301_000 }), false);
});

test("separates plugin and WordPress signing directions", () => {
  const body = canonicalJson({ ok: true });
  const pluginSignature = signRequest({ secret, purpose: "plugin-to-cloud", method: "POST", path: "/api/v1/test", timestamp, body });
  assert.equal(
    verifyRequest({ secret, purpose: "cloud-to-wordpress", method: "POST", path: "/api/v1/test", timestamp, body, signature: pluginSignature, now }),
    false,
  );
});

test("separates activation and publishing signatures", () => {
  const body = canonicalJson({ status: "active", siteId: "site-1" });
  const activationSignature = signRequest({ secret, purpose: "cloud-activation", method: "POST", path: "/activate", timestamp, body });
  assert.equal(
    verifyRequest({ secret, purpose: "cloud-to-wordpress", method: "POST", path: "/activate", timestamp, body, signature: activationSignature, now }),
    false,
  );
});

test("separates pending and activation callbacks", () => {
  const secret = "shared-secret-that-is-long-enough-for-tests";
  const input = { method: "POST", path: "/wp-json/neo-authority/v1/connection-pending", timestamp: "1700000000", body: "{}" };
  const pending = signRequest({ secret, purpose: "cloud-pending", ...input });
  const activation = signRequest({ secret, purpose: "cloud-activation", ...input });
  assert.notEqual(pending, activation);
});

test("separates inventory pulls from publishing callbacks", () => {
  const input = { method: "POST", path: "/wp-json/neo-authority/v1/content-inventory", timestamp, body: "{}" };
  const inventory = signRequest({ secret, purpose: "cloud-inventory", ...input });
  const publishing = signRequest({ secret, purpose: "cloud-to-wordpress", ...input });
  assert.notEqual(inventory, publishing);
});

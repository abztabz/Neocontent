import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { SupabaseRepository } from "../db/supabase.js";
import type { RegisterSiteInput } from "../sites/register-site.js";
import { encryptSecret } from "./secret-vault.js";
import { authorizeRegistration } from "./registration.js";
import { canonicalJson, signRequest } from "./signatures.js";

const path = "/api/v1/sites/register";
const timestamp = String(Math.floor(Date.now() / 1000));
const payload: RegisterSiteInput = {
  siteId: "11111111-1111-4111-8111-111111111111",
  siteSecret: "new-site-secret-with-more-than-thirty-two-characters",
  websiteUrl: "https://example.com/",
  callbackUrl: "https://example.com/wp-json/neo-authority/v1/publish",
  businessName: "Example",
};

function repository(existing: Record<string, unknown> | null, pending: Record<string, unknown> | null = null): SupabaseRepository {
  return {
    findSiteByExternalId: async () => existing,
    findPendingSiteConnection: async () => pending,
  } as unknown as SupabaseRepository;
}

function request(secret: string, purpose: string, enrollmentToken?: string, connectionRequest?: string) {
  const body = canonicalJson(payload);
  return {
    method: "POST",
    path,
    body,
    headers: {
      "x-neo-site-id": payload.siteId,
      "x-neo-timestamp": timestamp,
      "x-neo-signature": signRequest({ secret, purpose, method: "POST", path, timestamp, body }),
      "x-neo-enrollment-token": enrollmentToken,
      "x-neo-connection-request": connectionRequest,
    },
  };
}

test("new registrations require either a server token or a keyless connection request", async () => {
  const previous = process.env.NEO_REGISTRATION_TOKEN;
  process.env.NEO_REGISTRATION_TOKEN = "server-enrollment-token-with-adequate-entropy-123";
  try {
    await assert.rejects(
      authorizeRegistration(repository(null), request(payload.siteSecret, "registration"), payload),
      /connection request/i,
    );
    await authorizeRegistration(
      repository(null),
      request(payload.siteSecret, "registration", process.env.NEO_REGISTRATION_TOKEN),
      payload,
    );
    const pending = await authorizeRegistration(
      repository(null),
      request(payload.siteSecret, "registration", undefined, "1"),
      payload,
    );
    assert.equal(pending.mode, "pending");
  } finally {
    if (previous === undefined) delete process.env.NEO_REGISTRATION_TOKEN;
    else process.env.NEO_REGISTRATION_TOKEN = previous;
  }
});

test("pending connections cannot be taken over with an attacker-selected secret", async () => {
  const previousKey = process.env.NEO_SECRET_ENCRYPTION_KEY;
  process.env.NEO_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const originalSecret = "original-pending-secret-with-more-than-thirty-two-characters";
  try {
    const pending = { status: "pending", encrypted_site_secret: encryptSecret(originalSecret) };
    await assert.rejects(
      authorizeRegistration(repository(null, pending), request(payload.siteSecret, "registration", undefined, "1"), payload),
      /signature/i,
    );
    const authorized = await authorizeRegistration(
      repository(null, pending), request(originalSecret, "registration", undefined, "1"), payload,
    );
    assert.equal(authorized.mode, "pending");
  } finally {
    if (previousKey === undefined) delete process.env.NEO_SECRET_ENCRYPTION_KEY;
    else process.env.NEO_SECRET_ENCRYPTION_KEY = previousKey;
  }
});

test("existing sites cannot be taken over with an attacker-selected secret", async () => {
  const previousKey = process.env.NEO_SECRET_ENCRYPTION_KEY;
  process.env.NEO_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const originalSecret = "original-site-secret-with-more-than-thirty-two-characters";
  try {
    const existing = { encrypted_site_secret: encryptSecret(originalSecret) };
    await assert.rejects(
      authorizeRegistration(repository(existing), request(payload.siteSecret, "registration"), payload),
      /signature/i,
    );
    await authorizeRegistration(repository(existing), request(originalSecret, "plugin-to-cloud"), payload);
  } finally {
    if (previousKey === undefined) delete process.env.NEO_SECRET_ENCRYPTION_KEY;
    else process.env.NEO_SECRET_ENCRYPTION_KEY = previousKey;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseRepository } from "./supabase.js";

test("source updates are scoped to both object and authenticated site", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify([{ id: "source-1" }]), { status: 200 });
  }) as typeof fetch;
  try {
    const repository = new SupabaseRepository({ url: "https://example.supabase.co", serviceRoleKey: "test-key" });
    await repository.updateUserSource("source-1", "site-a", { status: "approved" });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get("id"), "eq.source-1");
    assert.equal(url.searchParams.get("site_id"), "eq.site-a");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tenant-scoped updates fail closed when no owned row is returned", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("[]", { status: 200 })) as typeof fetch;
  try {
    const repository = new SupabaseRepository({ url: "https://example.supabase.co", serviceRoleKey: "test-key" });
    await assert.rejects(
      repository.updateUserSource("source-from-site-b", "site-a", { status: "approved" }),
      /not found for this site/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("customer content-job queries exclude private brief and draft payloads", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
  try {
    const repository = new SupabaseRepository({ url: "https://example.supabase.co", serviceRoleKey: "test-key" });
    await repository.listCustomerContentJobs("site-a");
    const select = new URL(requestedUrl).searchParams.get("select") ?? "";
    assert.match(select, /topic/);
    assert.doesNotMatch(select, /brief_payload|draft_payload|customer_feedback/);
    assert.equal(new URL(requestedUrl).searchParams.get("site_id"), "eq.site-a");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduled paid-model runs select only cloud-api sites", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
  try {
    const repository = new SupabaseRepository({ url: "https://example.supabase.co", serviceRoleKey: "test-key" });
    await repository.listDueSites();
    assert.equal(new URL(requestedUrl).searchParams.get("workflow_mode"), "eq.cloud_api");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("customer content reviews are scoped to both job and authenticated site", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify([{ id: "job-a" }]), { status: 200 });
  }) as typeof fetch;
  try {
    const repository = new SupabaseRepository({ url: "https://example.supabase.co", serviceRoleKey: "test-key" });
    await repository.updateOperatorContentJobForSite("job-a", "site-a", { status: "approved" });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get("id"), "eq.job-a");
    assert.equal(url.searchParams.get("site_id"), "eq.site-a");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

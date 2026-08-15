import assert from "node:assert/strict";
import test from "node:test";
import { createInitialOperatorContentJob, createScheduledOperatorContentJob, nextResearchAt, researchAuditSummary } from "./initial-content-job.js";

const research = async () => ({
  generatedAt: "2026-08-15T00:00:00.000Z",
  usage: "discovery_only_requires_independent_verification",
  providers: [{ id: "gdelt-doc", observedAt: "2026-08-15T00:00:00.000Z", attribution: "GDELT Project", dataBoundary: "Discovery only" }],
  items: [{ kind: "news", title: "Current research lead", url: "https://news.example/article", publisher: "news.example", discoveredVia: "gdelt-doc" }],
  seoSignals: [],
  diagnostics: [{ capability: "news-discovery", status: "ok", provider: "gdelt-doc", itemCount: 1, latencyMs: 125, fallbackCount: 0 }],
});

test("calculates the next research time from the customer cadence", () => {
  const start = new Date("2026-08-12T00:00:00.000Z");
  assert.equal(nextResearchAt("daily", start), "2026-08-13T00:00:00.000Z");
  assert.equal(nextResearchAt("weekly", start), "2026-08-19T00:00:00.000Z");
  assert.equal(nextResearchAt("biweekly", start), "2026-08-26T00:00:00.000Z");
  assert.equal(nextResearchAt("monthly", start), "2026-09-12T00:00:00.000Z");
});

test("creates one governed first brief with discovery leads when a site is connected", async () => {
  const insertedJobs: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const repository = {
    findOperatorContentJobByIdempotencyKey: async () => insertedJobs[0] ?? null,
    listApprovedKnowledge: async () => [{ title: "About", content: "Approved business information", source_url: "https://example.com/about", source_type: "website" }],
    listApprovedSources: async () => [],
    listRecentArticles: async () => [],
    listCustomerContentJobs: async () => insertedJobs,
    listSiteContentItems: async () => [{ title: "Existing website post", excerpt: "Editorial sample", content_text: "Editorial sample", url: "https://example.com/post", content_type: "post", voice_eligible: true }],
    updateSite: async () => ({}),
    insertOperatorContentJob: async (input: Record<string, unknown>) => {
      const job = { id: "11111111-1111-4111-8111-111111111111", ...input };
      insertedJobs.push(job);
      return job;
    },
    insertOperatorAuditEvent: async (input: Record<string, unknown>) => (audits.push(input), input),
    insertOperatorNotificationOutbox: async () => null,
  };
  const site = {
    id: "22222222-2222-4222-8222-222222222222",
    organization_id: "33333333-3333-4333-8333-333333333333",
    website_url: "https://example.com/",
    business_name: "Example Media",
    business_description: "Entertainment news and reviews",
    industry: "entertainment media",
    target_audience: "Nepali audiences",
    services: ["News and reviews"],
    locations: ["Nepal"],
    tone: "Entertaining and professional",
    content_mode: "balanced",
    content_learning_status: "completed",
  };

  const first = await createInitialOperatorContentJob(repository as never, site, research);
  const second = await createInitialOperatorContentJob(repository as never, site, research);

  assert.equal(first.id, second.id);
  assert.equal(insertedJobs[0].status, "brief_ready");
  assert.equal(insertedJobs[0].idempotency_key, "site-connected-v1");
  const brief = insertedJobs[0].brief_payload as Record<string, unknown>;
  assert.equal(brief.schemaVersion, "neo-luna-brief-v1");
  assert.equal((((brief.externalResearchLeads as Record<string, unknown>).items as unknown[]).length), 1);
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].metadata, {
    trigger: "site_connected",
    research: {
      status: "available",
      leadCount: 1,
      providers: ["gdelt-doc"],
      capabilities: [{ capability: "news-discovery", status: "ok", provider: "gdelt-doc", itemCount: 1, fallbackCount: 0, latencyMs: 125 }],
    },
  });
  const auditJson = JSON.stringify(audits[0].metadata);
  assert.equal(auditJson.includes("Current research lead"), false);
  assert.equal(auditJson.includes("news.example"), false);
});

test("research audit summaries never retain discovery titles, URLs, or raw diagnostics", () => {
  const summary = researchAuditSummary({
    providers: [{ id: "crossref", secret: "do-not-copy" }],
    items: [{ title: "private topic phrase", url: "https://source.example/a" }],
    diagnostics: [{ capability: "scholarly-discovery", status: "ok", provider: "crossref", itemCount: 1, fallbackCount: 2, latencyMs: 99, rawError: "private topic phrase" }],
  });
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("private topic phrase"), false);
  assert.equal(serialized.includes("source.example"), false);
  assert.equal(serialized.includes("do-not-copy"), false);
  assert.deepEqual(summary.providers, ["crossref"]);
});

test("defers scheduled research while an article still requires action", async () => {
  const repository = {
    listCustomerContentJobs: async () => [{ id: "job-a", status: "brief_ready" }],
  };
  const result = await createScheduledOperatorContentJob(repository as never, { id: "site-a", content_learning_status: "completed" }, research);
  assert.deepEqual(result, { status: "deferred", reason: "An article still requires operator action" });
});

test("continues scheduled research while fewer than three drafts await customer review", async () => {
  const insertedJobs: Record<string, unknown>[] = [];
  const repository = {
    findOperatorContentJobByIdempotencyKey: async () => null,
    listApprovedKnowledge: async () => [], listApprovedSources: async () => [], listRecentArticles: async () => [],
    listCustomerContentJobs: async () => insertedJobs.length ? insertedJobs : [
      { id: "delivered-a", status: "delivered", topic: "First article" },
      { id: "delivered-b", status: "delivered", topic: "Second article" },
    ],
    listSiteContentItems: async () => [], updateSite: async () => ({}),
    insertOperatorContentJob: async (input: Record<string, unknown>) => {
      const job = { id: "scheduled-job", ...input }; insertedJobs.push(job); return job;
    },
    insertOperatorAuditEvent: async (input: Record<string, unknown>) => input,
    insertOperatorNotificationOutbox: async () => null,
  };
  const result = await createScheduledOperatorContentJob(repository as never, {
    id: "site-a", organization_id: "org-a", website_url: "https://example.com/", business_name: "Example Media",
    industry: "media", target_audience: "readers", cadence: "daily", next_run_at: "2026-08-14T00:00:00.000Z",
    content_learning_status: "completed",
  }, research);
  assert.equal(result.id, "scheduled-job");
});

test("pauses scheduled research when three drafts await customer review", async () => {
  const repository = { listCustomerContentJobs: async () => [
    { id: "delivered-a", status: "delivered" }, { id: "delivered-b", status: "delivered" }, { id: "delivered-c", status: "delivered" },
  ] };
  const result = await createScheduledOperatorContentJob(repository as never, { id: "site-a", content_learning_status: "completed" }, research);
  assert.deepEqual(result, { status: "deferred", reason: "Customer review queue has reached its limit" });
});

test("creates the next brief after the previous article is completed", async () => {
  const insertedJobs: Record<string, unknown>[] = [];
  const repository = {
    findOperatorContentJobByIdempotencyKey: async () => null,
    listApprovedKnowledge: async () => [],
    listApprovedSources: async () => [],
    listRecentArticles: async () => [{ title: "Existing completed article" }],
    listCustomerContentJobs: async () => insertedJobs.length > 0 ? insertedJobs : [{ id: "old-job", status: "completed", topic: "Existing completed article" }],
    listSiteContentItems: async () => [],
    updateSite: async () => ({}),
    insertOperatorContentJob: async (input: Record<string, unknown>) => {
      const job = { id: "scheduled-job", ...input };
      insertedJobs.push(job);
      return job;
    },
    insertOperatorAuditEvent: async (input: Record<string, unknown>) => input,
    insertOperatorNotificationOutbox: async () => null,
  };
  const site = {
    id: "site-a",
    organization_id: "org-a",
    website_url: "https://example.com/",
    business_name: "Example Media",
    industry: "entertainment media",
    target_audience: "Nepali audiences",
    services: ["News and reviews"],
    locations: ["Nepal"],
    cadence: "weekly",
    next_run_at: "2026-08-12T00:00:00.000Z",
    content_learning_status: "completed",
  };

  const result = await createScheduledOperatorContentJob(repository as never, site, research);

  assert.equal(result.id, "scheduled-job");
  assert.equal(insertedJobs[0].idempotency_key, "cadence:2026-08-12T00:00:00.000Z");
  assert.equal(insertedJobs[0].status, "brief_ready");
});

test("still creates a brief when external discovery is unavailable", async () => {
  const insertedJobs: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const repository = {
    findOperatorContentJobByIdempotencyKey: async () => null,
    listApprovedKnowledge: async () => [], listApprovedSources: async () => [], listRecentArticles: async () => [],
    listCustomerContentJobs: async () => [], listSiteContentItems: async () => [], updateSite: async () => ({}),
    insertOperatorContentJob: async (input: Record<string, unknown>) => { const job = { id: "job", ...input }; insertedJobs.push(job); return job; },
    insertOperatorAuditEvent: async (input: Record<string, unknown>) => (audits.push(input), input),
    insertOperatorNotificationOutbox: async () => null,
  };
  const unavailable = async () => { throw new Error("provider outage with private query material"); };
  const result = await createInitialOperatorContentJob(repository as never, {
    id: "site-a", organization_id: "org-a", business_name: "Example", industry: "media", target_audience: "readers",
    content_learning_status: "completed",
  }, unavailable as never);
  assert.equal(result.id, "job");
  const brief = insertedJobs[0].brief_payload as Record<string, unknown>;
  assert.equal((((brief.externalResearchLeads as Record<string, unknown>).items as unknown[]).length), 0);
  const auditJson = JSON.stringify(audits[0].metadata);
  assert.equal(auditJson.includes("private query material"), false);
  assert.match(auditJson, /unavailable/);
});

test("defers all topic generation until website learning completes", async () => {
  const repository = { listCustomerContentJobs: async () => [] };
  const result = await createScheduledOperatorContentJob(repository as never, {
    id: "site-a",
    content_learning_status: "learning",
  }, research);
  assert.deepEqual(result, { status: "deferred", reason: "Website learning must complete before research" });
});

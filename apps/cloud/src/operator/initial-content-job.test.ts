import assert from "node:assert/strict";
import test from "node:test";
import { createInitialOperatorContentJob, createScheduledOperatorContentJob, nextResearchAt } from "./initial-content-job.js";

test("calculates the next research time from the customer cadence", () => {
  const start = new Date("2026-08-12T00:00:00.000Z");
  assert.equal(nextResearchAt("daily", start), "2026-08-13T00:00:00.000Z");
  assert.equal(nextResearchAt("weekly", start), "2026-08-19T00:00:00.000Z");
  assert.equal(nextResearchAt("biweekly", start), "2026-08-26T00:00:00.000Z");
  assert.equal(nextResearchAt("monthly", start), "2026-09-12T00:00:00.000Z");
});

test("creates one governed first brief when a site is connected", async () => {
  const insertedJobs: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const repository = {
    findOperatorContentJobByIdempotencyKey: async () => insertedJobs[0] ?? null,
    listApprovedKnowledge: async () => [{ title: "About", content: "Approved business information", source_url: "https://example.com/about", source_type: "website" }],
    listApprovedSources: async () => [],
    listRecentArticles: async () => [],
    listCustomerContentJobs: async () => insertedJobs,
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
  };

  const first = await createInitialOperatorContentJob(repository as never, site);
  const second = await createInitialOperatorContentJob(repository as never, site);

  assert.equal(first.id, second.id);
  assert.equal(insertedJobs[0].status, "brief_ready");
  assert.equal(insertedJobs[0].idempotency_key, "site-connected-v1");
  assert.equal((insertedJobs[0].brief_payload as Record<string, unknown>).schemaVersion, "neo-luna-brief-v1");
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].metadata, { trigger: "site_connected" });
});

test("defers scheduled research while an article still requires action", async () => {
  const repository = {
    listCustomerContentJobs: async () => [{ id: "job-a", status: "brief_ready" }],
  };
  const result = await createScheduledOperatorContentJob(repository as never, { id: "site-a" });
  assert.deepEqual(result, { status: "deferred", reason: "An article is already in progress" });
});

test("creates the next brief after the previous article is completed", async () => {
  const insertedJobs: Record<string, unknown>[] = [];
  const repository = {
    findOperatorContentJobByIdempotencyKey: async () => null,
    listApprovedKnowledge: async () => [],
    listApprovedSources: async () => [],
    listRecentArticles: async () => [{ title: "Existing completed article" }],
    listCustomerContentJobs: async () => insertedJobs.length > 0 ? insertedJobs : [{ id: "old-job", status: "completed", topic: "Existing completed article" }],
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
  };

  const result = await createScheduledOperatorContentJob(repository as never, site);

  assert.equal(result.id, "scheduled-job");
  assert.equal(insertedJobs[0].idempotency_key, "cadence:2026-08-12T00:00:00.000Z");
  assert.equal(insertedJobs[0].status, "brief_ready");
});

import assert from "node:assert/strict";
import test from "node:test";
import { createInitialOperatorContentJob } from "./initial-content-job.js";

test("creates one governed first brief when a site is connected", async () => {
  const insertedJobs: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const repository = {
    findOperatorContentJobByIdempotencyKey: async () => insertedJobs[0] ?? null,
    listApprovedKnowledge: async () => [{ title: "About", content: "Approved business information", source_url: "https://example.com/about", source_type: "website" }],
    listApprovedSources: async () => [],
    listRecentArticles: async () => [],
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

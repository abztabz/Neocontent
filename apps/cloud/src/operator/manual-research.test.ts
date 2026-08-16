import assert from "node:assert/strict";
import test from "node:test";
import { createManualOperatorContentJob } from "./initial-content-job.js";

const research = async () => ({
  generatedAt: "2026-08-16T00:00:00.000Z",
  usage: "discovery_only_requires_independent_verification",
  routing: { profile: "general" as const, capabilities: ["news-discovery" as const], reasons: ["current_public_context"] },
  providers: [{ id: "gdelt-doc", observedAt: "2026-08-16T00:00:00.000Z", attribution: "GDELT Project", dataBoundary: "Discovery only" }],
  items: [{ kind: "news", title: "Current research lead", url: "https://news.example/article", publisher: "news.example", discoveredVia: "gdelt-doc" }],
  seoSignals: [],
  diagnostics: [{ capability: "news-discovery", status: "ok", provider: "gdelt-doc", itemCount: 1, latencyMs: 25, fallbackCount: 0 }],
});

test("manual research uses the governed pipeline without moving the scheduled cadence", async () => {
  const insertedJobs: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  let scheduleUpdates = 0;
  const repository = {
    findOperatorContentJobByIdempotencyKey: async () => null,
    listApprovedKnowledge: async () => [],
    listApprovedSources: async () => [],
    listRecentArticles: async () => [{ title: "Existing article" }],
    listCustomerContentJobs: async () => insertedJobs.length ? insertedJobs : [{ id: "done", status: "approved", topic: "Existing article" }],
    listSiteContentItems: async () => Array.from({ length: 10 }, (_, index) => ({
      title: `Top ${index + 5} Nepali Songs`,
      excerpt: "नेपाली संगीत र कलाकारबारे स्थानीय शैलीमा सामग्री।",
      content_text: "नेपाली संगीत र कलाकारबारे स्थानीय शैलीमा सामग्री। ".repeat(80),
      url: `https://example.com/post-${index}`,
      content_type: "post",
      voice_eligible: true,
      modified_at: "2026-08-15T00:00:00.000Z",
    })),
    updateSite: async () => { scheduleUpdates += 1; return {}; },
    insertOperatorContentJob: async (input: Record<string, unknown>) => {
      const job = { id: "manual-job", ...input };
      insertedJobs.push(job);
      return job;
    },
    insertOperatorAuditEvent: async (input: Record<string, unknown>) => (audits.push(input), input),
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
    cadence: "daily",
    next_run_at: "2026-08-17T02:00:00.000Z",
    content_learning_status: "completed",
  };

  const result = await createManualOperatorContentJob(repository as never, site, research);

  assert.equal(result.id, "manual-job");
  assert.match(String(insertedJobs[0].idempotency_key), /^manual:/);
  assert.equal(scheduleUpdates, 0);
  assert.equal((audits[0].metadata as Record<string, unknown>).trigger, "manual_operator");
  const brief = insertedJobs[0].brief_payload as Record<string, unknown>;
  assert.equal((brief.editorialDNA as Record<string, unknown>).schemaVersion, "neo-editorial-dna-v1");
});

test("manual research preserves the existing operator-action gate", async () => {
  const repository = {
    listCustomerContentJobs: async () => [{ id: "job-a", status: "brief_ready" }],
  };
  const result = await createManualOperatorContentJob(repository as never, { id: "site-a", content_learning_status: "completed" }, research);
  assert.deepEqual(result, { status: "deferred", reason: "An article still requires operator action" });
});

test("manual research preserves the customer review queue limit", async () => {
  const repository = {
    listCustomerContentJobs: async () => [
      { id: "a", status: "delivered" },
      { id: "b", status: "delivered" },
      { id: "c", status: "delivered" },
    ],
  };
  const result = await createManualOperatorContentJob(repository as never, { id: "site-a", content_learning_status: "completed" }, research);
  assert.deepEqual(result, { status: "deferred", reason: "Customer review queue has reached its limit" });
});

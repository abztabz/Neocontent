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

function repositoryWith(existingJobs: Record<string, unknown>[] = []) {
  const insertedJobs: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  let scheduleUpdates = 0;
  const repository = {
    findOperatorContentJobByIdempotencyKey: async () => null,
    listApprovedKnowledge: async () => [],
    listApprovedSources: async () => [],
    listRecentArticles: async () => [{ title: "Existing article" }],
    listCustomerContentJobs: async () => [...existingJobs, ...insertedJobs],
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
      const job = { id: `manual-job-${insertedJobs.length + 1}`, ...input };
      insertedJobs.push(job);
      return job;
    },
    insertOperatorAuditEvent: async (input: Record<string, unknown>) => (audits.push(input), input),
    insertOperatorNotificationOutbox: async () => null,
  };
  return { repository, insertedJobs, audits, scheduleUpdates: () => scheduleUpdates };
}

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

test("manual research uses the governed pipeline without moving the scheduled cadence", async () => {
  const state = repositoryWith([{ id: "done", status: "approved", topic: "Existing article" }]);
  const result = await createManualOperatorContentJob(state.repository as never, site, research);

  assert.equal(result.id, "manual-job-1");
  assert.match(String(state.insertedJobs[0].idempotency_key), /^manual:/);
  assert.equal(state.scheduleUpdates(), 0);
  assert.equal((state.audits[0].metadata as Record<string, unknown>).trigger, "manual_operator");
  const brief = state.insertedJobs[0].brief_payload as Record<string, unknown>;
  assert.equal((brief.editorialDNA as Record<string, unknown>).schemaVersion, "neo-editorial-dna-v1");
});

test("explicit manual research is not blocked by an article awaiting operator action", async () => {
  const state = repositoryWith([{ id: "job-a", status: "brief_ready", topic: "Pending article" }]);
  const result = await createManualOperatorContentJob(state.repository as never, site, research);

  assert.equal(result.id, "manual-job-1");
  assert.equal(state.insertedJobs.length, 1);
  assert.equal(state.scheduleUpdates(), 0);
});

test("explicit manual research is not blocked by the customer review queue", async () => {
  const state = repositoryWith([
    { id: "a", status: "delivered", topic: "A" },
    { id: "b", status: "delivered", topic: "B" },
    { id: "c", status: "delivered", topic: "C" },
  ]);
  const result = await createManualOperatorContentJob(state.repository as never, site, research);

  assert.equal(result.id, "manual-job-1");
  assert.equal(state.insertedJobs.length, 1);
  assert.equal(state.scheduleUpdates(), 0);
});

test("manual research still requires completed website learning", async () => {
  const result = await createManualOperatorContentJob({} as never, { id: "site-a", content_learning_status: "running" }, research);
  assert.deepEqual(result, { status: "deferred", reason: "Website learning must complete before research" });
});

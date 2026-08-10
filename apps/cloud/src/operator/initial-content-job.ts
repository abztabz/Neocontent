import type { SupabaseRepository } from "../db/supabase.js";
import { generateOpportunities, selectOpportunity } from "../opportunities/opportunity-engine.js";
import { createLunaBrief } from "./briefing-layer.js";
import { notifyOperatorSafely } from "./push-notifications.js";

type InitialContentRepository = Pick<SupabaseRepository,
  "findOperatorContentJobByIdempotencyKey"
  | "insertOperatorAuditEvent"
  | "insertOperatorContentJob"
  | "listApprovedKnowledge"
  | "listApprovedSources"
  | "listRecentArticles"
>;

const initialJobKey = "site-connected-v1";

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 50) : [];
}

export async function createInitialOperatorContentJob(
  repository: InitialContentRepository,
  site: Record<string, unknown>,
) {
  const siteId = String(site.id ?? "");
  const organizationId = String(site.organization_id ?? "");
  if (!siteId || !organizationId) throw new Error("Registered site cannot start its first research job");

  const existing = await repository.findOperatorContentJobByIdempotencyKey(siteId, initialJobKey);
  if (existing) return existing;

  const [knowledge, sources, recentArticles] = await Promise.all([
    repository.listApprovedKnowledge(siteId),
    repository.listApprovedSources(siteId),
    repository.listRecentArticles(siteId),
  ]);
  const services = list(site.services);
  const locations = list(site.locations);
  const opportunities = generateOpportunities({
    businessName: String(site.business_name || "the business"),
    industry: String(site.industry || "the industry"),
    audience: String(site.target_audience || "customers"),
    services,
    contentMode: String(site.content_mode || "balanced"),
    evidenceCount: sources.length,
    existingTitles: recentArticles.map((article) => String(article.title ?? "")).filter(Boolean),
  });
  const opportunity = selectOpportunity(opportunities);
  const customerSummary = opportunity.rationale;
  const brief = createLunaBrief({
    topic: opportunity.title,
    customerSummary,
    approvedSources: sources,
    rawBrief: {
      website: {
        url: String(site.website_url || ""),
        name: String(site.business_name || ""),
        description: String(site.business_description || ""),
        industry: String(site.industry || ""),
        audience: String(site.target_audience || ""),
        services,
        locations,
        tone: String(site.tone || ""),
        contentMode: String(site.content_mode || "balanced"),
      },
      approvedKnowledge: knowledge.map((item) => ({
        title: String(item.title ?? ""),
        content: String(item.content ?? ""),
        sourceUrl: String(item.source_url ?? ""),
        sourceType: String(item.source_type ?? "website"),
      })),
      existingArticleTitles: recentArticles.map((article) => String(article.title ?? "")).filter(Boolean),
    },
  });

  const job = await repository.insertOperatorContentJob({
    organization_id: organizationId,
    site_id: siteId,
    topic: opportunity.title,
    customer_summary: customerSummary,
    status: "brief_ready",
    brief_payload: brief,
    idempotency_key: initialJobKey,
  });
  if (!job) throw new Error("Initial research job could not be created");

  await repository.insertOperatorAuditEvent({
    organization_id: organizationId,
    site_id: siteId,
    job_id: job.id,
    event_type: "content_job_created",
    actor_type: "system",
    outcome: "success",
    metadata: { trigger: "site_connected" },
  });
  await notifyOperatorSafely(repository as SupabaseRepository, "brief_ready", `brief-ready:${String(job.id)}`);
  return job;
}

import type { SupabaseRepository } from "../db/supabase.js";
import { generateOpportunities, selectOpportunity } from "../opportunities/opportunity-engine.js";
import { createLunaBrief } from "./briefing-layer.js";
import { notifyOperatorSafely } from "./push-notifications.js";

type OperatorProgramRepository = Pick<SupabaseRepository,
  "findOperatorContentJobByIdempotencyKey"
  | "insertOperatorAuditEvent"
  | "insertOperatorContentJob"
  | "listApprovedKnowledge"
  | "listApprovedSources"
  | "listCustomerContentJobs"
  | "listRecentArticles"
  | "listSiteContentItems"
  | "updateSite"
>;

const initialJobKey = "site-connected-v1";
const operatorActionStatuses = new Set(["researching", "brief_ready", "draft_ready", "changes_requested"]);
const maximumAwaitingCustomerReview = 3;

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 50) : [];
}

export function nextResearchAt(cadence: unknown, from: Date = new Date()): string {
  const date = new Date(from);
  if (cadence === "daily") date.setUTCDate(date.getUTCDate() + 1);
  else if (cadence === "biweekly") date.setUTCDate(date.getUTCDate() + 14);
  else if (cadence === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString();
}

async function createProgramJob(
  repository: OperatorProgramRepository,
  site: Record<string, unknown>,
  idempotencyKey: string,
  trigger: "site_connected" | "scheduled_cadence",
) {
  const siteId = String(site.id ?? "");
  const organizationId = String(site.organization_id ?? "");
  if (!siteId || !organizationId) throw new Error("Registered site cannot start a research job");

  const existing = await repository.findOperatorContentJobByIdempotencyKey(siteId, idempotencyKey);
  if (existing) return existing;

  if (String(site.content_learning_status ?? "not_started") !== "completed") {
    return { status: "deferred", reason: "Website learning must complete before research" };
  }

  const [knowledge, sources, recentArticles, priorJobs, websiteContent] = await Promise.all([
    repository.listApprovedKnowledge(siteId),
    repository.listApprovedSources(siteId),
    repository.listRecentArticles(siteId),
    repository.listCustomerContentJobs(siteId, 100),
    repository.listSiteContentItems(siteId, 1000),
  ]);
  const services = list(site.services);
  const locations = list(site.locations);
  const existingTitles = [
    ...recentArticles.map((article) => String(article.title ?? "")),
    ...priorJobs.map((job) => String(job.topic ?? "")),
    ...websiteContent.map((item) => String(item.title ?? "")),
  ].filter(Boolean);
  const opportunities = generateOpportunities({
    businessName: String(site.business_name || "the business"),
    industry: String(site.industry || "the industry"),
    audience: String(site.target_audience || "customers"),
    services,
    locations,
    contentMode: String(site.content_mode || "balanced"),
    evidenceCount: sources.length,
    existingTitles,
  });
  const opportunity = selectOpportunity(opportunities);
  const customerSummary = `${opportunity.rationale} ${opportunity.whyNow}`;
  const brief = createLunaBrief({
    topic: opportunity.title,
    customerSummary,
    opportunity: opportunity as unknown as Record<string, unknown>,
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
      websiteContent: websiteContent.map((item) => ({
        title: String(item.title ?? ""),
        excerpt: String(item.excerpt ?? ""),
        content: String(item.content_text ?? ""),
        url: String(item.url ?? ""),
        contentType: String(item.content_type ?? ""),
        voiceEligible: item.voice_eligible === true,
        modifiedAt: item.modified_at ?? null,
        metadata: item.metadata ?? {},
      })),
      existingArticleTitles: existingTitles,
    },
  });

  const job = await repository.insertOperatorContentJob({
    organization_id: organizationId,
    site_id: siteId,
    topic: opportunity.title,
    customer_summary: customerSummary,
    status: "brief_ready",
    brief_payload: brief,
    idempotency_key: idempotencyKey,
  });
  if (!job) throw new Error("Research job could not be created");

  await repository.insertOperatorAuditEvent({
    organization_id: organizationId,
    site_id: siteId,
    job_id: job.id,
    event_type: "content_job_created",
    actor_type: "system",
    outcome: "success",
    metadata: { trigger },
  });
  await repository.updateSite(siteId, { next_run_at: nextResearchAt(site.cadence) });
  await notifyOperatorSafely(repository as SupabaseRepository, "brief_ready", `brief-ready:${String(job.id)}`);
  return job;
}

export async function createInitialOperatorContentJob(
  repository: OperatorProgramRepository,
  site: Record<string, unknown>,
) {
  return createProgramJob(repository, site, initialJobKey, "site_connected");
}

export async function createScheduledOperatorContentJob(
  repository: OperatorProgramRepository,
  site: Record<string, unknown>,
) {
  const siteId = String(site.id ?? "");
  if (!siteId) throw new Error("Scheduled site identifier is missing");
  if (String(site.content_learning_status ?? "not_started") !== "completed") {
    return { status: "deferred", reason: "Website learning must complete before research" };
  }
  const jobs = await repository.listCustomerContentJobs(siteId, 100);
  if (jobs.some((job) => operatorActionStatuses.has(String(job.status ?? "")))) {
    return { status: "deferred", reason: "An article still requires operator action" };
  }
  const awaitingCustomerReview = jobs.filter((job) => String(job.status ?? "") === "delivered").length;
  if (awaitingCustomerReview >= maximumAwaitingCustomerReview) {
    return { status: "deferred", reason: "Customer review queue has reached its limit" };
  }
  const scheduledFor = String(site.next_run_at || new Date().toISOString());
  return createProgramJob(repository, site, `cadence:${scheduledFor}`, "scheduled_cadence");
}

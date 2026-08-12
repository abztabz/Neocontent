import { createRepository } from "../../runtime.js";
import { authenticateSiteRequest, type SignedRequestLike } from "../authenticate.js";
import { createLunaBrief } from "../../operator/briefing-layer.js";
import { notifyOperatorSafely } from "../../operator/push-notifications.js";
import { nextResearchAt } from "../../operator/initial-content-job.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ContentJobPayload {
  action?: "create" | "list" | "review" | "settings";
  idempotencyKey?: string;
  jobId?: string;
  decision?: "approved" | "rejected" | "changes_requested";
  feedback?: string;
  topic?: string;
  customerSummary?: string;
  brief?: Record<string, unknown>;
  profile?: Record<string, unknown>;
}

function profileText(value: unknown, maximum: number): string {
  return String(value ?? "").trim().slice(0, maximum);
}

function profileList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => profileText(item, 200)).filter(Boolean).slice(0, 50) : [];
}

export async function handleCustomerContentJobs(
  request: SignedRequestLike,
  expectedExternalSiteId: string,
  payload: ContentJobPayload,
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request, expectedExternalSiteId);

  if (payload.action === "list") {
    const jobs = await repository.listCustomerContentJobs(String(site.id));
    return {
      status: 200,
      body: {
        jobs,
        cadence: String(site.cadence ?? "weekly"),
        nextResearchAt: site.next_run_at ?? null,
      },
    };
  }
  if (payload.action === "settings") {
    if (!payload.profile || Array.isArray(payload.profile) || typeof payload.profile !== "object") {
      throw new Error("Customer settings profile is invalid");
    }
    const profile = payload.profile;
    const cadence = profileText(profile.cadence, 20);
    const contentMode = profileText(profile.contentMode, 30);
    if (!["daily", "weekly", "biweekly", "monthly"].includes(cadence)) throw new Error("Customer cadence is invalid");
    if (!["business_focused", "balanced", "industry_authority"].includes(contentMode)) throw new Error("Customer content mode is invalid");
    const updated = await repository.updateSite(String(site.id), {
      business_name: profileText(profile.businessName, 200),
      business_description: profileText(profile.businessDescription, 5_000),
      industry: profileText(profile.industry, 300),
      target_audience: profileText(profile.targetAudience, 2_000),
      tone: profileText(profile.tone, 500),
      services: profileList(profile.services),
      locations: profileList(profile.locations),
      content_mode: contentMode,
      cadence,
    });
    return { status: 200, body: { settings: { cadence: updated?.cadence, contentMode: updated?.content_mode } } };
  }
  if (payload.action === "review") {
    if (!payload.jobId || !uuidPattern.test(payload.jobId)) throw new Error("A valid jobId is required");
    if (!payload.decision || !["approved", "rejected", "changes_requested"].includes(payload.decision)) {
      throw new Error("Content review decision is invalid");
    }
    const feedback = String(payload.feedback ?? "").trim();
    if (feedback.length > 5000) throw new Error("Content review feedback is too long");
    const owned = (await repository.listCustomerContentJobs(String(site.id), 100)).find((job) => job.id === payload.jobId);
    if (!owned) throw new Error("Content job was not found for this site");
    if (!["delivered", "changes_requested"].includes(String(owned.status))) throw new Error("Content job cannot be reviewed in its current state");
    const job = await repository.updateOperatorContentJobForSite(payload.jobId, String(site.id), {
      status: payload.decision,
      customer_feedback: feedback,
      reviewed_at: new Date().toISOString(),
    });
    await repository.insertOperatorAuditEvent({
      organization_id: site.organization_id,
      site_id: site.id,
      job_id: payload.jobId,
      event_type: `customer_${payload.decision === "changes_requested" ? "changes_requested" : payload.decision}`,
      actor_type: "customer",
      outcome: "success",
      metadata: {},
    });
    if (payload.decision === "changes_requested") {
      await notifyOperatorSafely(repository, "changes_requested", `changes-requested:${payload.jobId}:${String(job.reviewed_at ?? "")}`);
    }
    if (["approved", "rejected"].includes(payload.decision)) {
      await repository.updateSite(String(site.id), { next_run_at: nextResearchAt(site.cadence) });
    }
    return { status: 200, body: { job: { id: job.id, status: job.status, reviewed_at: job.reviewed_at } } };
  }
  if (payload.action !== "create") throw new Error("Content job action is not recognized");
  if (!payload.idempotencyKey || !uuidPattern.test(payload.idempotencyKey)) {
    throw new Error("A valid idempotencyKey is required");
  }
  const topic = String(payload.topic ?? "").trim();
  const customerSummary = String(payload.customerSummary ?? "").trim();
  if (!topic || topic.length > 300) throw new Error("Content job topic is invalid");
  if (customerSummary.length > 1000) throw new Error("Customer summary is too long");
  if (!payload.brief || Array.isArray(payload.brief) || typeof payload.brief !== "object") {
    throw new Error("A structured content brief is required");
  }
  const approvedSources = await repository.listApprovedSources(String(site.id));
  const enrichedBrief = createLunaBrief({
    topic,
    customerSummary,
    rawBrief: payload.brief,
    approvedSources,
  });
  const serialized = JSON.stringify(enrichedBrief);
  if (serialized.length > 500_000) throw new Error("Content brief is too large");

  const job = await repository.insertOperatorContentJob({
    organization_id: site.organization_id,
    site_id: site.id,
    topic,
    customer_summary: customerSummary,
    status: "brief_ready",
    brief_payload: enrichedBrief,
    idempotency_key: payload.idempotencyKey,
  });
  if (job) await repository.insertOperatorAuditEvent({
    organization_id: site.organization_id,
    site_id: site.id,
    job_id: job.id,
    event_type: "content_job_created",
    actor_type: "system",
    outcome: "success",
    metadata: {},
  });
  if (job) await notifyOperatorSafely(repository, "brief_ready", `brief-ready:${String(job.id)}`);
  return {
    status: 201,
    body: {
      job: job ? {
        id: job.id,
        topic: job.topic,
        customer_summary: job.customer_summary,
        status: job.status,
        created_at: job.created_at,
      } : null,
    },
  };
}

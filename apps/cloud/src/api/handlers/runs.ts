import { createRepository } from "../../runtime.js";
import { authenticateSiteRequest, type SignedRequestLike } from "../authenticate.js";
import { runSite } from "../../runs/run-site.js";

export async function handleRun(
  request: SignedRequestLike,
  expectedExternalSiteId: string,
  payload: { trigger?: "manual" | "scheduled"; idempotencyKey?: string },
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request, expectedExternalSiteId);
  if (String(site.workflow_mode ?? "operator_managed") !== "cloud_api") {
    throw new Error("Automated generation is disabled for this site");
  }
  if (!payload.idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.idempotencyKey)) {
    throw new Error("A valid idempotencyKey is required");
  }
  if (payload.trigger && payload.trigger !== "manual") throw new Error("Manual endpoint only accepts manual runs");

  const existing = await repository.findRunByIdempotencyKey(String(site.id), payload.idempotencyKey);
  if (existing) {
    return {
      status: 200,
      body: {
        status: existing.status,
        runId: existing.id,
        articleId: existing.article_id,
        duplicate: true,
      },
    };
  }

  const configuredLimit = Number(process.env.NEO_MAX_MANUAL_RUNS_PER_HOUR ?? 3);
  const maxRuns = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(20, Math.floor(configuredLimit))) : 3;
  const recentRuns = await repository.listRunsSince(String(site.id), new Date(Date.now() - 60 * 60_000).toISOString(), maxRuns);
  if (recentRuns.length >= maxRuns) throw new Error("Manual run rate limit exceeded");
  const result = await runSite(
    repository,
    site,
    payload.trigger ?? "manual",
    payload.idempotencyKey as `${string}-${string}-${string}-${string}-${string}`,
  );
  return { status: 200, body: result };
}

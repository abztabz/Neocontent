import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createRepository } from "../../src/runtime.js";
import { runSite } from "../../src/runs/run-site.js";
import { createInitialOperatorContentJob, createScheduledOperatorContentJob } from "../../src/operator/initial-content-job.js";
import type { VercelRequestLike, VercelResponseLike } from "../_http.js";
import { sendError } from "../_http.js";
import { processSiteContentLearning } from "../../src/sites/site-content-learning.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  try {
    const authorization = Array.isArray(request.headers.authorization)
      ? request.headers.authorization[0]
      : request.headers.authorization;
    const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const expected = process.env.CRON_SECRET ?? "";
    const suppliedHash = createHash("sha256").update(supplied).digest();
    const expectedHash = createHash("sha256").update(expected).digest();
    if (!supplied || !expected || !timingSafeEqual(suppliedHash, expectedHash)) {
      return response.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid cron authorization" } });
    }

    const repository = createRepository();
    const [sites, operatorSites, learningSites] = await Promise.all([
      repository.listDueSites(10),
      repository.listDueOperatorManagedSites(10),
      repository.listSitesDueContentLearning(5),
    ]);
    const results: Record<string, unknown>[] = [];
    for (const site of sites) {
      try {
        results.push({ siteId: site.external_site_id, ...(await runSite(repository, site, "scheduled", randomUUID())) });
      } catch (error) {
        results.push({
          siteId: site.external_site_id,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const learningSiteIds = new Set(learningSites.map((site) => String(site.id)));
    for (const site of learningSites) {
      try {
        const learning = await processSiteContentLearning(repository, site, 4);
        if (learning.status === "completed") {
          const refreshed = await repository.findSiteByExternalId(String(site.external_site_id));
          await createInitialOperatorContentJob(repository, refreshed ?? site);
        }
        results.push({ siteId: site.external_site_id, workflow: "content_learning", ...learning });
      } catch (error) {
        results.push({
          siteId: site.external_site_id,
          workflow: "content_learning",
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const site of operatorSites) {
      if (learningSiteIds.has(String(site.id)) || String(site.content_learning_status ?? "not_started") !== "completed") continue;
      try {
        results.push({
          siteId: site.external_site_id,
          workflow: "operator_managed",
          ...(await createScheduledOperatorContentJob(repository, site)),
        });
      } catch (error) {
        results.push({
          siteId: site.external_site_id,
          workflow: "operator_managed",
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    response.status(200).json({ processed: results.length, results });
  } catch (error) {
    sendError(response, error);
  }
}

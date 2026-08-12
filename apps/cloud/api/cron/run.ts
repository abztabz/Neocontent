import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createRepository } from "../../src/runtime.js";
import { runSite } from "../../src/runs/run-site.js";
import { createScheduledOperatorContentJob } from "../../src/operator/initial-content-job.js";
import type { VercelRequestLike, VercelResponseLike } from "../_http.js";
import { sendError } from "../_http.js";

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
    const [sites, operatorSites] = await Promise.all([
      repository.listDueSites(10),
      repository.listDueOperatorManagedSites(10),
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
    for (const site of operatorSites) {
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

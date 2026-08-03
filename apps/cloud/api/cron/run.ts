import { randomUUID } from "node:crypto";
import { createRepository } from "../../src/runtime.js";
import { runSite } from "../../src/runs/run-site.js";
import type { VercelRequestLike, VercelResponseLike } from "../_http.js";
import { sendError } from "../_http.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  try {
    const authorization = Array.isArray(request.headers.authorization)
      ? request.headers.authorization[0]
      : request.headers.authorization;
    if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return response.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid cron authorization" } });
    }

    const repository = createRepository();
    const sites = await repository.listDueSites(20);
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
    response.status(200).json({ processed: results.length, results });
  } catch (error) {
    sendError(response, error);
  }
}

import { handleRun } from "../../../../src/api/handlers/runs.js";
import type { VercelRequestLike, VercelResponseLike } from "../../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../../_http.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const siteId = String(request.query.siteId ?? "");
    const path = `/api/v1/sites/${siteId}/runs`;
    const result = await handleRun({
      method: "POST",
      path,
      body: rawBody(request),
      headers: normalizedHeaders(request),
    }, request.body as { trigger?: "manual" | "scheduled"; idempotencyKey?: string });
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

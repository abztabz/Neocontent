import { handleSourceDecision } from "../../../../../../src/api/handlers/sources.js";
import type { VercelRequestLike, VercelResponseLike } from "../../../../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../../../../_http.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const siteId = String(request.query.siteId ?? "");
    const sourceId = String(request.query.sourceId ?? "");
    const path = `/api/v1/sites/${siteId}/sources/${sourceId}/decision`;
    const payload = request.body as { decision: "approve" | "reject"; approvedClaims?: string[] };
    const result = await handleSourceDecision({
      method: "POST",
      path,
      body: rawBody(request),
      headers: normalizedHeaders(request),
    }, siteId, sourceId, payload.decision, payload.approvedClaims ?? []);
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

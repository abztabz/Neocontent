import { handleKnowledgeCandidates } from "../../../../src/api/handlers/knowledge.js";
import type { VercelRequestLike, VercelResponseLike } from "../../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../../_http.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const siteId = String(request.query.siteId ?? "");
    const path = `/api/v1/sites/${siteId}/knowledge-candidates`;
    const payload = request.body as { candidates?: unknown[] };
    if (!Array.isArray(payload.candidates) || payload.candidates.length > 100) {
      throw new Error("Knowledge candidates must be an array of at most 100 items");
    }
    const result = await handleKnowledgeCandidates({
      method: "POST",
      path,
      body: rawBody(request),
      headers: normalizedHeaders(request),
    }, siteId, payload.candidates as never[]);
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

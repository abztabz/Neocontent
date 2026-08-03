import { handleKnowledgeDecision } from "../../../../../../src/api/handlers/knowledge.js";
import type { VercelRequestLike, VercelResponseLike } from "../../../../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../../../../_http.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const siteId = String(request.query.siteId ?? "");
    const candidateId = String(request.query.candidateId ?? "");
    const path = `/api/v1/sites/${siteId}/knowledge-candidates/${candidateId}/decision`;
    const payload = request.body as { decision: "approve" | "reject"; editedContent?: string };
    const result = await handleKnowledgeDecision({
      method: "POST",
      path,
      body: rawBody(request),
      headers: normalizedHeaders(request),
    }, candidateId, payload.decision, payload.editedContent);
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

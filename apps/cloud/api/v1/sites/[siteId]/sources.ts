import { handleAddSource } from "../../../../src/api/handlers/sources.js";
import type { VercelRequestLike, VercelResponseLike } from "../../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../../_http.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const siteId = String(request.query.siteId ?? "");
    const path = `/api/v1/sites/${siteId}/sources`;
    const body = rawBody(request);
    const result = await handleAddSource({
      method: "POST",
      path,
      body,
      headers: normalizedHeaders(request),
    }, request.body as { url: string; label?: string; purpose: "business_knowledge" | "industry_research" | "preferred_research" | "topic_discovery_only" });
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

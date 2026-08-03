import type { RegisterSiteInput } from "../../../src/sites/register-site.js";
import { handleRegisterSite } from "../../../src/api/handlers/register.js";
import { verifyRequest } from "../../../src/security/signatures.js";
import type { VercelRequestLike, VercelResponseLike } from "../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../_http.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const payload = (request.body ?? {}) as RegisterSiteInput;
    const headers = normalizedHeaders(request);
    const valid = verifyRequest({
      secret: payload.siteSecret,
      method: "POST",
      path: "/api/v1/sites/register",
      timestamp: headers["x-neo-timestamp"] ?? "",
      body: rawBody(request),
      signature: headers["x-neo-signature"] ?? "",
    });
    if (!valid || headers["x-neo-site-id"] !== payload.siteId) {
      return response.status(401).json({ error: { code: "BAD_SIGNATURE", message: "Registration signature is invalid" } });
    }
    const result = await handleRegisterSite(payload);
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

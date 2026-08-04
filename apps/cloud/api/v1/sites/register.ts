import type { RegisterSiteInput } from "../../../src/sites/register-site.js";
import { handleRegisterSite } from "../../../src/api/handlers/register.js";
import { authorizeRegistration } from "../../../src/security/registration.js";
import { createRepository } from "../../../src/runtime.js";
import type { VercelRequestLike, VercelResponseLike } from "../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../_http.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const payload = (request.body ?? {}) as RegisterSiteInput;
    const headers = normalizedHeaders(request);
    await authorizeRegistration(createRepository(), {
      method: "POST",
      path: "/api/v1/sites/register",
      body: rawBody(request),
      headers,
    }, payload);
    const result = await handleRegisterSite(payload);
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

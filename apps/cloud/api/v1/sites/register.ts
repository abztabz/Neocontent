import type { RegisterSiteInput } from "../../../src/sites/register-site.js";
import { handleRegisterSite } from "../../../src/api/handlers/register.js";
import type { VercelRequestLike, VercelResponseLike } from "../../_http.js";
import { sendError } from "../../_http.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const result = await handleRegisterSite((request.body ?? {}) as RegisterSiteInput);
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

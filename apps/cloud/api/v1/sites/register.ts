import type { RegisterSiteInput } from "../../../src/sites/register-site.js";
import { handleRegisterSite } from "../../../src/api/handlers/register.js";
import { authorizeRegistration } from "../../../src/security/registration.js";
import { createRepository } from "../../../src/runtime.js";
import type { VercelRequestLike, VercelResponseLike } from "../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../_http.js";
import { encryptSecret } from "../../../src/security/secret-vault.js";
import { validateRegisterSiteInput } from "../../../src/sites/register-site.js";
import { notifyOperatorSafely } from "../../../src/operator/push-notifications.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const payload = (request.body ?? {}) as RegisterSiteInput;
    const headers = normalizedHeaders(request);
    const repository = createRepository();
    const authorization = await authorizeRegistration(repository, {
      method: "POST",
      path: "/api/v1/sites/register",
      body: rawBody(request),
      headers,
    }, payload);
    if (authorization.mode === "pending") {
      const pending = authorization.pendingConnection;
      if (pending?.status === "rejected") return response.status(200).json({ status: "support_required" });
      if (!pending) {
        if (await repository.countPendingSiteConnections() >= 100) throw new Error("Connection request rate limit reached");
        const validated = validateRegisterSiteInput(payload);
        const { siteSecret: _secret, ...profile } = validated;
        await repository.upsertPendingSiteConnection({
          external_site_id: validated.siteId,
          website_url: validated.websiteUrl,
          callback_url: validated.callbackUrl,
          business_name: validated.businessName,
          profile,
          encrypted_site_secret: encryptSecret(validated.siteSecret),
          status: "pending",
        });
        await notifyOperatorSafely(repository, "connection_requested", `connection-requested:${validated.siteId}`);
      }
      return response.status(202).json({ status: "pending" });
    }
    const result = await handleRegisterSite(payload);
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

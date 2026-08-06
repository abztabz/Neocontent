import type { RegisterSiteInput } from "../../../src/sites/register-site.js";
import { handleRegisterSite } from "../../../src/api/handlers/register.js";
import { authorizeRegistration } from "../../../src/security/registration.js";
import { createRepository } from "../../../src/runtime.js";
import type { VercelRequestLike, VercelResponseLike } from "../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../_http.js";
import { encryptSecret } from "../../../src/security/secret-vault.js";
import { validateRegisterSiteInput } from "../../../src/sites/register-site.js";
import { notifyOperatorSafely } from "../../../src/operator/push-notifications.js";
import { activateWordPressSite, verifyWordPressConnectionProof } from "../../../src/sites/wordpress-connection.js";

function browserOrigin(request: VercelRequestLike): string {
  const value = normalizedHeaders(request).origin ?? "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443")
      ? url.origin
      : "";
  } catch {
    return "";
  }
}

function setCors(response: VercelResponseLike, origin: string): void {
  if (origin) response.setHeader?.("access-control-allow-origin", origin);
  response.setHeader?.("vary", "Origin");
  response.setHeader?.("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader?.("access-control-allow-headers", "content-type, x-neo-site-id, x-neo-timestamp, x-neo-signature, x-neo-connection-request, x-neo-browser-connection");
  response.setHeader?.("access-control-max-age", "600");
}

export function assertBrowserConnectionOrigin(
  headers: Record<string, string | undefined>,
  origin: string,
  websiteUrl: string,
): void {
  if (headers["x-neo-browser-connection"] !== "1") return;
  if (!origin || origin !== new URL(websiteUrl).origin) throw new Error("Browser connection origin is invalid");
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  const origin = browserOrigin(request);
  if (request.method === "OPTIONS") {
    if (!origin) return response.status(400).json({ error: { code: "INVALID_ORIGIN", message: "A valid HTTPS origin is required" } });
    setCors(response, origin);
    response.status(204).send?.("");
    return;
  }
  if (request.method !== "POST") return response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } });
  try {
    const payload = (request.body ?? {}) as RegisterSiteInput;
    const headers = normalizedHeaders(request);
    const validated = validateRegisterSiteInput(payload);
    assertBrowserConnectionOrigin(headers, origin, validated.websiteUrl);
    if (headers["x-neo-browser-connection"] === "1") {
      setCors(response, origin);
    }
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
        const sameWebsite = await repository.findPendingSiteConnectionByWebsite(validated.websiteUrl);
        if (sameWebsite && String(sameWebsite.external_site_id ?? "") !== validated.siteId) {
          throw new Error("Website already has a pending connection request");
        }
        await verifyWordPressConnectionProof(validated);
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
    const site = await repository.findSiteByExternalId(validated.siteId);
    if (!site) throw new Error("Registered site was not found");
    await activateWordPressSite(site);
    response.status(result.status).json(result.body);
  } catch (error) {
    sendError(response, error);
  }
}

import type { RegisterSiteInput } from "../../../src/sites/register-site.js";
import { handleRegisterSite } from "../../../src/api/handlers/register.js";
import { authorizeRegistration } from "../../../src/security/registration.js";
import { createRepository } from "../../../src/runtime.js";
import type { VercelRequestLike, VercelResponseLike } from "../../_http.js";
import { normalizedHeaders, rawBody, sendError } from "../../_http.js";
import { encryptSecret } from "../../../src/security/secret-vault.js";
import { validateRegisterSiteInput } from "../../../src/sites/register-site.js";
import { notifyOperatorSafely } from "../../../src/operator/push-notifications.js";
import {
  activateWordPressSite,
  markWordPressConnectionPending,
  verifyWordPressConnectionProof,
} from "../../../src/sites/wordpress-connection.js";

interface BrowserNavigationEnvelope {
  schemaVersion: "neo-browser-navigation-v1";
  payload: string;
  siteId: string;
  timestamp: string;
  signature: string;
  returnUrl: string;
  state: string;
}

export function browserNavigationEnvelope(body: unknown): BrowserNavigationEnvelope | null {
  let encoded = "";
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const value = (body as Record<string, unknown>).neo_connection_envelope;
    if (typeof value === "string") encoded = value;
  } else if (typeof body === "string") {
    encoded = new URLSearchParams(body).get("neo_connection_envelope") ?? "";
  }
  if (!encoded || encoded.length > 65_536) return null;
  let value: unknown;
  try { value = JSON.parse(encoded); } catch { throw new Error("Browser connection envelope is invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Browser connection envelope is invalid");
  const item = value as Record<string, unknown>;
  if (item.schemaVersion !== "neo-browser-navigation-v1"
    || typeof item.payload !== "string" || item.payload.length < 2 || item.payload.length > 50_000
    || typeof item.siteId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.siteId)
    || typeof item.timestamp !== "string" || !/^\d{10}$/.test(item.timestamp)
    || typeof item.signature !== "string" || !/^[0-9a-f]{64}$/i.test(item.signature)
    || typeof item.returnUrl !== "string" || item.returnUrl.length > 2_048
    || typeof item.state !== "string" || !/^[A-Za-z0-9]{32,128}$/.test(item.state)) {
    throw new Error("Browser connection envelope is invalid");
  }
  return item as unknown as BrowserNavigationEnvelope;
}

export function validatedReturnUrl(value: string, websiteUrl: string, callbackUrl: string): URL {
  const target = new URL(value);
  const website = new URL(websiteUrl);
  const callback = new URL(callbackUrl);
  const expectedPath = callback.pathname.replace(/wp-json\/neo-authority\/v1\/publish\/?$/, "wp-admin/admin.php");
  if (target.protocol !== "https:" || target.origin !== website.origin
    || target.pathname !== expectedPath || target.searchParams.get("page") !== "neo-authority-settings") {
    throw new Error("Browser connection return URL is invalid");
  }
  target.search = "";
  target.searchParams.set("page", "neo-authority-settings");
  return target;
}

function redirectBrowser(response: VercelResponseLike, target: URL, state: string, result: "sent" | "error"): void {
  target.searchParams.set("nae_connection", result);
  target.searchParams.set("nae_state", state);
  response.setHeader?.("location", target.toString());
  response.setHeader?.("cache-control", "no-store");
  response.status(303).send?.("");
}

function browserOrigin(request: VercelRequestLike): string {
  const headers = normalizedHeaders(request);
  const value = headers.origin ?? headers.referer ?? "";
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
  let navigation: BrowserNavigationEnvelope | null = null;
  let returnTarget: URL | null = null;
  let stage = "parse-navigation";
  try {
    navigation = browserNavigationEnvelope(request.body);
    stage = "validate-payload";
    const payload = navigation
      ? JSON.parse(navigation.payload) as RegisterSiteInput
      : (request.body ?? {}) as RegisterSiteInput;
    const headers = navigation ? {
      "content-type": "application/json",
      "x-neo-site-id": navigation.siteId,
      "x-neo-timestamp": navigation.timestamp,
      "x-neo-signature": navigation.signature,
      "x-neo-connection-request": "1",
      "x-neo-browser-connection": "1",
    } : normalizedHeaders(request);
    const validated = validateRegisterSiteInput(payload);
    stage = "validate-return-url";
    if (navigation) returnTarget = validatedReturnUrl(navigation.returnUrl, validated.websiteUrl, validated.callbackUrl);
    stage = "validate-browser-origin";
    assertBrowserConnectionOrigin(headers, origin, validated.websiteUrl);
    if (headers["x-neo-browser-connection"] === "1") {
      setCors(response, origin);
    }
    const repository = createRepository();
    stage = "authorize-registration";
    const authorization = await authorizeRegistration(repository, {
      method: "POST",
      path: "/api/v1/sites/register",
      body: navigation ? navigation.payload : rawBody(request),
      headers,
    }, payload);
    if (authorization.mode === "pending") {
      const pending = authorization.pendingConnection;
      if (pending?.status === "rejected") {
        if (navigation && returnTarget) return redirectBrowser(response, returnTarget, navigation.state, "error");
        return response.status(200).json({ status: "support_required" });
      }
      if (!pending) {
        stage = "check-pending-capacity";
        if (await repository.countPendingSiteConnections() >= 100) throw new Error("Connection request rate limit reached");
        const sameWebsite = await repository.findPendingSiteConnectionByWebsite(validated.websiteUrl);
        if (sameWebsite && String(sameWebsite.external_site_id ?? "") !== validated.siteId) {
          throw new Error("Website already has a pending connection request");
        }
        stage = "verify-wordpress-proof";
        await verifyWordPressConnectionProof(validated);
        const { siteSecret: _secret, ...profile } = validated;
        stage = "store-pending-connection";
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
      stage = "mark-wordpress-pending";
      await markWordPressConnectionPending(validated);
      if (navigation && returnTarget) return redirectBrowser(response, returnTarget, navigation.state, "sent");
      return response.status(202).json({ status: "pending" });
    }
    stage = "register-existing-site";
    const result = await handleRegisterSite(payload);
    const site = await repository.findSiteByExternalId(validated.siteId);
    if (!site) throw new Error("Registered site was not found");
    await activateWordPressSite(site);
    if (navigation && returnTarget) return redirectBrowser(response, returnTarget, navigation.state, "sent");
    response.status(result.status).json(result.body);
  } catch (error) {
    console.warn("[site-registration] rejected", {
      stage,
      browserNavigation: Boolean(navigation),
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown registration error",
    });
    if (navigation && returnTarget) return redirectBrowser(response, returnTarget, navigation.state, "error");
    sendError(response, error);
  }
}

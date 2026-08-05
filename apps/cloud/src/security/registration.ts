import { createHash, timingSafeEqual } from "node:crypto";
import { SupabaseRepository } from "../db/supabase.js";
import type { RegisterSiteInput } from "../sites/register-site.js";
import { decryptSecret } from "./secret-vault.js";
import { verifyRequest } from "./signatures.js";

export interface RegistrationRequest {
  method: string;
  path: string;
  body: string;
  headers: Record<string, string | undefined>;
}

export interface RegistrationAuthorization {
  mode: "existing" | "direct" | "pending";
  existingSite: Record<string, unknown> | null;
  pendingConnection: Record<string, unknown> | null;
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export async function authorizeRegistration(
  repository: SupabaseRepository,
  request: RegistrationRequest,
  payload: RegisterSiteInput,
): Promise<RegistrationAuthorization> {
  const headerSiteId = request.headers["x-neo-site-id"] ?? "";
  if (!payload.siteId || !safeEqual(headerSiteId, payload.siteId)) {
    throw new Error("Registration site identifier is invalid");
  }

  const existing = await repository.findSiteByExternalId(payload.siteId);
  const pending = existing ? null : await repository.findPendingSiteConnection(payload.siteId);
  const suppliedSecret = existing
    ? decryptSecret(String(existing.encrypted_site_secret ?? ""))
    : pending
      ? decryptSecret(String(pending.encrypted_site_secret ?? ""))
      : payload.siteSecret;

  const verify = (purpose: "plugin-to-cloud" | "registration") => verifyRequest({
    secret: suppliedSecret, purpose, method: request.method, path: request.path,
    timestamp: request.headers["x-neo-timestamp"] ?? "", body: request.body,
    signature: request.headers["x-neo-signature"] ?? "",
  });
  const valid = existing ? (verify("plugin-to-cloud") || verify("registration")) : verify("registration");
  if (!valid) throw new Error("Registration signature is invalid");

  if (existing) return { mode: "existing", existingSite: existing, pendingConnection: null };
  if (!pending) {
    const configuredToken = process.env.NEO_REGISTRATION_TOKEN ?? "";
    const suppliedToken = request.headers["x-neo-enrollment-token"] ?? "";
    if (configuredToken.length >= 32 && suppliedToken && safeEqual(configuredToken, suppliedToken)) {
      return { mode: "direct", existingSite: null, pendingConnection: null };
    }
    if (request.headers["x-neo-connection-request"] !== "1") throw new Error("A connection request is required for first registration");
  }
  return { mode: "pending", existingSite: null, pendingConnection: pending };
}

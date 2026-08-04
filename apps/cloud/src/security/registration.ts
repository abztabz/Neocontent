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

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export async function authorizeRegistration(
  repository: SupabaseRepository,
  request: RegistrationRequest,
  payload: RegisterSiteInput,
): Promise<void> {
  const headerSiteId = request.headers["x-neo-site-id"] ?? "";
  if (!payload.siteId || !safeEqual(headerSiteId, payload.siteId)) {
    throw new Error("Registration site identifier is invalid");
  }

  const existing = await repository.findSiteByExternalId(payload.siteId);
  const suppliedSecret = existing
    ? decryptSecret(String(existing.encrypted_site_secret ?? ""))
    : payload.siteSecret;
  const purpose = existing ? "plugin-to-cloud" : "registration";

  const valid = verifyRequest({
    secret: suppliedSecret,
    purpose,
    method: request.method,
    path: request.path,
    timestamp: request.headers["x-neo-timestamp"] ?? "",
    body: request.body,
    signature: request.headers["x-neo-signature"] ?? "",
  });
  if (!valid) throw new Error("Registration signature is invalid");

  if (!existing) {
    const configuredToken = process.env.NEO_REGISTRATION_TOKEN ?? "";
    const suppliedToken = request.headers["x-neo-enrollment-token"] ?? "";
    if (configuredToken.length < 32 || !suppliedToken || !safeEqual(configuredToken, suppliedToken)) {
      throw new Error("A valid enrollment token is required for first registration");
    }
  }
}

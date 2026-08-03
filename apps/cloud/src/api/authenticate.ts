import { verifyRequest } from "../security/signatures.js";
import { decryptSecret } from "../security/secret-vault.js";
import { SupabaseRepository } from "../db/supabase.js";

export interface SignedRequestLike {
  method: string;
  path: string;
  body: string;
  headers: Record<string, string | undefined>;
}

export async function authenticateSiteRequest(
  repository: SupabaseRepository,
  request: SignedRequestLike,
) {
  const siteId = request.headers["x-neo-site-id"] ?? "";
  const timestamp = request.headers["x-neo-timestamp"] ?? "";
  const suppliedSignature = request.headers["x-neo-signature"] ?? "";

  if (!siteId || !timestamp || !suppliedSignature) {
    throw new Error("Missing signed request headers");
  }

  const site = await repository.findSiteByExternalId(siteId);
  if (!site) throw new Error("Site is not registered");

  const encryptedSecret = String(site.encrypted_site_secret ?? "");
  const valid = verifyRequest({
    method: request.method,
    path: request.path,
    timestamp,
    body: request.body,
    signature: suppliedSignature,
    secret: decryptSecret(encryptedSecret),
    now: Date.now(),
  });
  if (!valid) throw new Error("Invalid or stale request signature");

  return site;
}

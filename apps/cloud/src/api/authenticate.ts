import { createHash } from "node:crypto";
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
  expectedExternalSiteId?: string,
) {
  const siteId = request.headers["x-neo-site-id"] ?? "";
  const timestamp = request.headers["x-neo-timestamp"] ?? "";
  const suppliedSignature = request.headers["x-neo-signature"] ?? "";

  if (!siteId || !timestamp || !suppliedSignature) {
    throw new Error("Missing signed request headers");
  }
  if (expectedExternalSiteId && siteId !== expectedExternalSiteId) {
    throw new Error("Signed site identifier does not match the requested route");
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
    purpose: "plugin-to-cloud",
    now: Date.now(),
  });
  if (!valid) throw new Error("Invalid or stale request signature");

  const signatureHash = createHash("sha256")
    .update(`${siteId}:${timestamp}:${suppliedSignature}`)
    .digest("hex");
  await repository.consumeRequestSignature(String(site.id), signatureHash);

  return site;
}

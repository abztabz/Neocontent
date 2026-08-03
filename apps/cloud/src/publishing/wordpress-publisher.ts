import { signRequest } from "../security/signatures.js";
import { decryptSecret } from "../security/secret-vault.js";
import type { GeneratedArticle } from "../writing/article-writer.js";

export async function publishToWordPress(input: {
  site: Record<string, unknown>;
  article: GeneratedArticle;
  idempotencyKey: string;
}) {
  const callbackUrl = String(input.site.callback_url ?? "");
  const encryptedSecret = String(input.site.encrypted_site_secret ?? "");
  if (!callbackUrl || !encryptedSecret) throw new Error("WordPress callback is not configured");

  const url = new URL(callbackUrl);
  const body = JSON.stringify({
    type: "blog",
    title: input.article.title,
    excerpt: input.article.excerpt,
    body: input.article.body,
    rationale: input.article.rationale,
    authorityScore: input.article.authorityScore,
    businessAlignmentScore: input.article.businessAlignmentScore,
    verificationScore: input.article.verificationScore,
    materialClaims: input.article.materialClaims,
    sources: input.article.sources,
    idempotencyKey: input.idempotencyKey,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signRequest({
    secret: decryptSecret(encryptedSecret),
    method: "POST",
    path: url.pathname,
    timestamp,
    body,
  });

  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-neo-timestamp": timestamp,
      "x-neo-signature": signature,
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`WordPress ${response.status}: ${text}`);
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

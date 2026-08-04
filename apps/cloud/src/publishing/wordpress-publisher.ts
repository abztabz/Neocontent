import { lookup } from "node:dns/promises";
import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { signRequest } from "../security/signatures.js";
import { decryptSecret } from "../security/secret-vault.js";
import type { GeneratedArticle } from "../writing/article-writer.js";

function isUnsafeAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd")
      || value.startsWith("fe80:") || (value.startsWith("::ffff:") && isUnsafeAddress(value.slice(7)));
  }
  return true;
}

async function postJsonPinned(url: URL, body: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isUnsafeAddress(record.address))) {
    throw new Error("WordPress callback resolves to an unsafe network address");
  }
  const destination = records[0];
  if (!destination) throw new Error("WordPress callback did not resolve");

  return new Promise((resolve, reject) => {
    const options: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: { ...headers, "content-length": String(Buffer.byteLength(body)), "accept-encoding": "identity" },
      lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url.protocol === "https:" ? { ...options, servername: url.hostname } : options,
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > 256_000) {
            response.destroy(new Error("WordPress response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    request.setTimeout(20_000, () => request.destroy(new Error("WordPress callback timed out")));
    request.on("error", reject);
    request.end(body);
  });
}

export async function publishToWordPress(input: {
  site: Record<string, unknown>;
  article: GeneratedArticle;
  idempotencyKey: string;
}) {
  const callbackUrl = String(input.site.callback_url ?? "");
  const encryptedSecret = String(input.site.encrypted_site_secret ?? "");
  if (!callbackUrl || !encryptedSecret) throw new Error("WordPress callback is not configured");

  const url = new URL(callbackUrl);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("WordPress callback URL is invalid");
  }
  if (!/(?:^|\/)wp-json\/neo-authority\/v1\/publish\/?$/.test(url.pathname)) {
    throw new Error("WordPress callback path is invalid");
  }
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
    seoTitle: input.article.seoTitle ?? "",
    metaDescription: input.article.metaDescription ?? "",
    focusKeyphrase: input.article.focusKeyphrase ?? "",
    idempotencyKey: input.idempotencyKey,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signRequest({
    secret: decryptSecret(encryptedSecret),
    purpose: "cloud-to-wordpress",
    method: "POST",
    path: url.pathname,
    timestamp,
    body,
  });

  const response = await postJsonPinned(url, body, {
      "content-type": "application/json",
      "x-neo-site-id": String(input.site.external_site_id ?? ""),
      "x-neo-timestamp": timestamp,
      "x-neo-signature": signature,
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`WordPress returned HTTP ${response.status}`);
  return response.body ? JSON.parse(response.body) as Record<string, unknown> : {};
}

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { requestWordPressPinned } from "../publishing/wordpress-publisher.js";
import { decryptSecret } from "../security/secret-vault.js";
import { signRequest } from "../security/signatures.js";
import type { RegisterSiteInput } from "./register-site.js";

type WordPressRequester = typeof requestWordPressPinned;

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function originOf(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("WordPress origin is invalid");
  }
  return url.origin;
}

export async function verifyWordPressConnectionProof(
  input: RegisterSiteInput,
  requester: WordPressRequester = requestWordPressPinned,
): Promise<void> {
  const origin = originOf(input.websiteUrl);
  const proofUrl = new URL(input.callbackUrl);
  proofUrl.pathname = proofUrl.pathname.replace(/publish\/?$/, "connection-proof");
  proofUrl.search = "";
  proofUrl.hash = "";
  const response = await requester({
    url: proofUrl,
    method: "GET",
    headers: { accept: "application/json" },
    timeoutMs: 8_000,
    maximumBytes: 8_192,
  });
  if (response.status !== 200 || !response.contentType.toLowerCase().includes("application/json")) {
    throw new Error("WordPress connection proof is unavailable");
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(response.body) as Record<string, unknown>;
  } catch {
    throw new Error("WordPress connection proof is invalid");
  }
  const siteId = String(payload.siteId ?? "");
  const returnedOrigin = String(payload.origin ?? "");
  const suppliedProof = String(payload.proof ?? "");
  const proofKey = createHmac("sha256", input.siteSecret).update("neo-connection-proof-v1").digest();
  const expectedProof = createHmac("sha256", proofKey).update(`${input.siteId}\n${origin}`).digest("hex");
  if (!safeEqual(siteId, input.siteId) || !safeEqual(returnedOrigin, origin) || !safeEqual(suppliedProof, expectedProof)) {
    throw new Error("WordPress connection proof did not match");
  }
}

export async function activateWordPressSite(
  site: Record<string, unknown>,
  requester: WordPressRequester = requestWordPressPinned,
): Promise<void> {
  const callback = new URL(String(site.callback_url ?? ""));
  if (callback.protocol !== "https:" || callback.username || callback.password || (callback.port && callback.port !== "443")) {
    throw new Error("WordPress callback URL is invalid");
  }
  if (!/(?:^|\/)wp-json\/neo-authority\/v1\/publish\/?$/.test(callback.pathname)) {
    throw new Error("WordPress callback path is invalid");
  }
  const activationUrl = new URL(callback.toString());
  activationUrl.pathname = callback.pathname.replace(/publish\/?$/, "activate");
  activationUrl.search = "";
  activationUrl.hash = "";
  const siteId = String(site.external_site_id ?? "");
  const body = JSON.stringify({ status: "active", siteId });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signRequest({
    secret: decryptSecret(String(site.encrypted_site_secret ?? "")),
    purpose: "cloud-activation",
    method: "POST",
    path: activationUrl.pathname,
    timestamp,
    body,
  });
  const response = await requester({
    url: activationUrl,
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-neo-site-id": siteId,
      "x-neo-timestamp": timestamp,
      "x-neo-signature": signature,
    },
    timeoutMs: 8_000,
    maximumBytes: 16_384,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`WordPress activation returned HTTP ${response.status}`);
  }
}

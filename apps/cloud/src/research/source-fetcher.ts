import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fetchSource as fetchPinnedSource } from "./fetch-source.js";
import { validateSourceUrl } from "./validate-source-url.js";

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

export async function validatePublicUrl(input: string): Promise<URL> {
  const url = validateSourceUrl(input);
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some(({ address }) => isUnsafeAddress(address))) {
    throw new Error("The source host resolves to a private or unsafe network address");
  }
  return url;
}

export interface RetrievedSource {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  retrievedAt: string;
  body: string;
}

export async function fetchSource(input: string): Promise<RetrievedSource> {
  const retrieved = await fetchPinnedSource(input, AbortSignal.timeout(20_000));
  if (retrieved.contentType !== "text/html" && retrieved.contentType !== "text/plain" && retrieved.contentType !== "application/xhtml+xml") {
    throw new Error(`Unsupported source content type: ${retrieved.contentType}`);
  }
  return {
    requestedUrl: retrieved.requestedUrl,
    finalUrl: retrieved.finalUrl,
    contentType: retrieved.contentType,
    retrievedAt: retrieved.retrievedAt,
    body: new TextDecoder("utf-8", { fatal: false }).decode(retrieved.body),
  };
}

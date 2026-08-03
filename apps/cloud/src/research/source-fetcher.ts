import { promises as dns } from "node:dns";
import net from "node:net";

const MAX_REDIRECTS = 4;
const MAX_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 15_000;

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) return PRIVATE_V4.some((pattern) => pattern.test(address));
  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
  }
  return true;
}

export async function validatePublicUrl(input: string): Promise<URL> {
  const url = new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS source URLs are supported");
  }
  if (url.username || url.password) throw new Error("Credential-bearing URLs are not allowed");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Local and internal hosts are blocked");
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(({ address }) => isPrivateIp(address))) {
    throw new Error("The source host resolves to a private or unsafe network address");
  }
  return url;
}

async function readLimitedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Source response exceeded the maximum allowed size");
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

export interface RetrievedSource {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  retrievedAt: string;
  body: string;
}

export async function fetchSource(input: string): Promise<RetrievedSource> {
  let current = await validatePublicUrl(input);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "NeoAuthorityBot/1.0 (+https://neoauthority.example)" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Source redirect did not include a location");
        current = await validatePublicUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      if (!contentType.startsWith("text/html") && !contentType.startsWith("text/plain")) {
        throw new Error(`Unsupported source content type: ${contentType || "unknown"}`);
      }
      return {
        requestedUrl: input,
        finalUrl: current.toString(),
        contentType,
        retrievedAt: new Date().toISOString(),
        body: await readLimitedBody(response),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Source exceeded the maximum redirect count");
}

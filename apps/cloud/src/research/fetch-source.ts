import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { validateSourceUrl } from "./validate-source-url.js";

const MAX_REDIRECTS = 3;
const MAX_BYTES = 2_000_000;
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
  "application/pdf",
];

export interface FetchedSource {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  body: Uint8Array;
  retrievedAt: string;
  etag?: string;
  lastModified?: string;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    (normalized.startsWith("::ffff:") && isPrivateIpv4(normalized.slice(7)))
  );
}

interface PublicDestination {
  address: string;
  family: 4 | 6;
}

async function resolvePublicDestination(url: URL): Promise<PublicDestination> {
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error("Source hostname did not resolve");

  for (const record of records) {
    if (record.family === 4 && isPrivateIpv4(record.address)) {
      throw new Error("Source resolves to a private IPv4 address");
    }
    if (record.family === 6 && isPrivateIpv6(record.address)) {
      throw new Error("Source resolves to a private IPv6 address");
    }
    if (!isIP(record.address)) throw new Error("Source resolved to an invalid address");
  }
  const selected = records[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) throw new Error("Source hostname did not resolve safely");
  return { address: selected.address, family: selected.family };
}

function assertAllowedContentType(value: string | null): string {
  const contentType = (value ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new Error(`Unsupported source content type: ${contentType || "unknown"}`);
  }
  return contentType;
}

function firstHeader(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function requestPinned(url: URL, destination: PublicDestination, signal?: AbortSignal): Promise<{
  status: number;
  headers: IncomingHttpHeaders;
  body: Uint8Array;
}> {
  return new Promise((resolve, reject) => {
    const options: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        "user-agent": "NeoAuthorityBot/1.1 (+https://living-content-engine.vercel.app)",
        accept: "text/html,text/plain,application/xhtml+xml,application/pdf;q=0.8",
        "accept-encoding": "identity",
      },
      lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
    };
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(url.protocol === "https:" ? { ...options, servername: url.hostname } : options, (incoming) => {
      const declaredLength = Number(firstHeader(incoming.headers, "content-length") ?? 0);
      if (declaredLength > MAX_BYTES) {
        incoming.destroy();
        reject(new Error("Source exceeds maximum allowed size"));
        return;
      }
      const encoding = (firstHeader(incoming.headers, "content-encoding") ?? "identity").toLowerCase();
      if (encoding !== "identity") {
        incoming.destroy();
        reject(new Error("Compressed source responses are not accepted"));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      incoming.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BYTES) {
          incoming.destroy(new Error("Source exceeds maximum allowed size"));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("error", reject);
      incoming.on("end", () => resolve({
        status: incoming.statusCode ?? 0,
        headers: incoming.headers,
        body: new Uint8Array(Buffer.concat(chunks)),
      }));
    });
    const abort = () => request.destroy(new Error("Source request was aborted"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    request.setTimeout(20_000, () => request.destroy(new Error("Source request timed out")));
    request.on("error", reject);
    request.on("close", () => signal?.removeEventListener("abort", abort));
    request.end();
  });
}

export async function fetchSource(
  inputUrl: string,
  signal?: AbortSignal,
): Promise<FetchedSource> {
  const initial = validateSourceUrl(inputUrl);
  let current = initial;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const destination = await resolvePublicDestination(current);
    const response = await requestPinned(current, destination, signal);

    if (response.status >= 300 && response.status < 400) {
      const location = firstHeader(response.headers, "location");
      if (!location) throw new Error("Redirect response did not include a location");
      if (redirectCount === MAX_REDIRECTS) throw new Error("Source exceeded redirect limit");
      current = validateSourceUrl(new URL(location, current).toString());
      continue;
    }

    if (response.status < 200 || response.status >= 300) throw new Error(`Source returned HTTP ${response.status}`);

    const contentType = assertAllowedContentType(firstHeader(response.headers, "content-type"));

    return {
      requestedUrl: initial.toString(),
      finalUrl: current.toString(),
      contentType,
      body: response.body,
      retrievedAt: new Date().toISOString(),
      etag: firstHeader(response.headers, "etag") ?? undefined,
      lastModified: firstHeader(response.headers, "last-modified") ?? undefined,
    };
  }

  throw new Error("Unable to retrieve source");
}

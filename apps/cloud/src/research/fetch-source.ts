import { lookup } from "node:dns/promises";
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
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

async function assertPublicDestination(url: URL): Promise<void> {
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
}

function assertAllowedContentType(value: string | null): string {
  const contentType = (value ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new Error(`Unsupported source content type: ${contentType || "unknown"}`);
  }
  return contentType;
}

async function readLimitedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BYTES) throw new Error("Source exceeds maximum allowed size");
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel("Source exceeded maximum allowed size");
      throw new Error("Source exceeds maximum allowed size");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export async function fetchSource(
  inputUrl: string,
  signal?: AbortSignal,
): Promise<FetchedSource> {
  const initial = validateSourceUrl(inputUrl);
  let current = initial;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicDestination(current);

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        "user-agent": "NeoAuthorityBot/1.0 (+https://neoauthority.example)",
        accept: "text/html,text/plain,application/xhtml+xml,application/pdf;q=0.8",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response did not include a location");
      if (redirectCount === MAX_REDIRECTS) throw new Error("Source exceeded redirect limit");
      current = validateSourceUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);

    const contentType = assertAllowedContentType(response.headers.get("content-type"));
    const body = await readLimitedBody(response);

    return {
      requestedUrl: initial.toString(),
      finalUrl: current.toString(),
      contentType,
      body,
      retrievedAt: new Date().toISOString(),
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
    };
  }

  throw new Error("Unable to retrieve source");
}

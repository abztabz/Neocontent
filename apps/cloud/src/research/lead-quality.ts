type UnknownRecord = Record<string, unknown>;

const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function canonicalUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:") return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParameters.has(key.toLocaleLowerCase())) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLocaleLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function leadKey(item: UnknownRecord): string {
  const doi = String(item.doi ?? "").trim().toLocaleLowerCase();
  if (doi) return `doi:${doi}`;
  const url = canonicalUrl(item.url);
  if (url) return `url:${url}`;
  const title = String(item.title ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return title ? `title:${title}` : "";
}

function ageInDays(value: unknown, now: Date): number | null {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return null;
  const age = Math.floor((now.getTime() - timestamp) / 86_400_000);
  return Math.max(0, age);
}

export function temporalRole(item: UnknownRecord, now: Date = new Date()): string {
  const ageDays = ageInDays(item.publishedAt, now);
  if (ageDays == null) return "unknown_time";
  if (item.kind === "news") {
    if (ageDays <= 3) return "current_signal";
    if (ageDays <= 14) return "recent_signal";
    return "historical_signal";
  }
  if (item.kind === "scholarly") {
    return ageDays <= 730 ? "recent_research" : "established_research";
  }
  return "dated_reference";
}

export function curateResearchLeads(values: unknown[], now: Date = new Date()): UnknownRecord[] {
  const seen = new Set<string>();
  const output: UnknownRecord[] = [];
  for (const value of values) {
    const item = record(value);
    const key = leadKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push({
      ...item,
      temporalRole: temporalRole(item, now),
      verificationStatus: "discovery_only",
    });
    if (output.length >= 13) break;
  }
  return output;
}

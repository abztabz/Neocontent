import { boundedQuery, fetchProviderJson, httpsUrl, type ProviderFetcher } from "../http.js";
import type { SourceProvider } from "../registry.js";

function firstString(value: unknown): string {
  return Array.isArray(value) ? boundedQuery(value[0], 500) : boundedQuery(value, 500);
}

function publishedAt(item: Record<string, unknown>): string | null {
  for (const key of ["published-online", "published-print", "published", "issued"]) {
    const value = item[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const parts = (value as Record<string, unknown>)["date-parts"];
    const row = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0] : [];
    const year = Number(row[0]);
    const month = Number(row[1] ?? 1);
    const day = Number(row[2] ?? 1);
    if (!Number.isInteger(year) || year < 1000 || year > 9999) continue;
    const stamp = new Date(Date.UTC(year, Math.min(Math.max(month, 1), 12) - 1, Math.min(Math.max(day, 1), 31)));
    if (Number.isFinite(stamp.getTime())) return stamp.toISOString();
  }
  return null;
}

export function crossrefAdapter(fetcher: ProviderFetcher = fetch, mailto = process.env.NEO_CROSSREF_MAILTO ?? "") {
  return async (input: Record<string, unknown>, provider: SourceProvider) => {
    const query = boundedQuery(input.query);
    if (query.length < 3) throw new Error("Crossref query is too short");
    const limit = Math.min(Math.max(Number(input.limit ?? 5) || 5, 1), 5);
    const url = new URL("/works", provider.baseUrl);
    url.searchParams.set("query.bibliographic", query);
    url.searchParams.set("rows", String(limit));
    url.searchParams.set("sort", "published");
    url.searchParams.set("order", "desc");
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailto)) url.searchParams.set("mailto", mailto);
    const payload = await fetchProviderJson(url, {
      fetcher,
      allowedOrigin: new URL(provider.baseUrl).origin,
      headers: { "user-agent": "NeoContent/1.7 (metadata research gateway)" },
    });
    const message = payload.message && typeof payload.message === "object" && !Array.isArray(payload.message)
      ? payload.message as Record<string, unknown> : {};
    const items = Array.isArray(message.items) ? message.items : [];
    const data = items.slice(0, limit).flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const item = value as Record<string, unknown>;
      const title = firstString(item.title);
      const urlValue = httpsUrl(item.URL);
      if (!title || !urlValue) return [];
      return [{
        kind: "scholarly",
        title,
        url: urlValue,
        doi: boundedQuery(item.DOI, 300),
        publisher: boundedQuery(item.publisher, 300),
        workType: boundedQuery(item.type, 100),
        publishedAt: publishedAt(item),
        verificationStatus: "discovery_only",
      }];
    });
    return { data, sourceObservedAt: new Date().toISOString() };
  };
}

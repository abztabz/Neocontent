import { boundedQuery, fetchProviderJson, httpsUrl, type ProviderFetcher } from "../http.js";
import type { SourceProvider } from "../registry.js";

function firstTitle(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const first = value.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
  return first ? boundedQuery((first as Record<string, unknown>).title, 500) : "";
}

export function dataciteAdapter(fetcher: ProviderFetcher = fetch) {
  return async (input: Record<string, unknown>, provider: SourceProvider) => {
    const query = boundedQuery(input.query);
    if (query.length < 3) throw new Error("DataCite query is too short");
    const url = new URL("/dois", provider.baseUrl);
    url.searchParams.set("query", query);
    url.searchParams.set("page[size]", "5");
    url.searchParams.set("sort", "relevance");
    url.searchParams.set("disable-facets", "true");
    const payload = await fetchProviderJson(url, {
      fetcher,
      allowedOrigin: new URL(provider.baseUrl).origin,
      headers: { "user-agent": "NeoContent/1.7 metadata discovery" },
    });
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const data = rows.slice(0, 5).flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const row = value as Record<string, unknown>;
      const attributes = row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
        ? row.attributes as Record<string, unknown> : {};
      const title = firstTitle(attributes.titles);
      const urlValue = httpsUrl(attributes.url);
      if (!title || !urlValue) return [];
      const types = attributes.types && typeof attributes.types === "object" && !Array.isArray(attributes.types)
        ? attributes.types as Record<string, unknown> : {};
      const year = Number(attributes.publicationYear);
      return [{
        kind: "scholarly",
        title,
        url: urlValue,
        doi: boundedQuery(attributes.doi ?? row.id, 300),
        publisher: boundedQuery(attributes.publisher, 300),
        workType: boundedQuery(types.resourceTypeGeneral ?? types.resourceType, 100),
        publishedAt: Number.isInteger(year) && year > 1000 && year < 10000 ? `${year}-01-01T00:00:00.000Z` : null,
        verificationStatus: "discovery_only",
      }];
    });
    return { data, sourceObservedAt: new Date().toISOString() };
  };
}

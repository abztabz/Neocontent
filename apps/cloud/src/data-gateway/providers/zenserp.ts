import type { GatewayAdapter } from "../gateway.js";
import { boundedQuery, fetchProviderJson, httpsUrl, type ProviderFetcher } from "../http.js";

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function domain(value: string): string {
  try { return new URL(value).hostname.toLocaleLowerCase(); } catch { return ""; }
}

export function zenserpAdapter(apiKey: string, fetcher?: ProviderFetcher): GatewayAdapter {
  const secret = apiKey.trim();
  return async (input, provider) => {
    if (!secret) throw new Error("Zenserp key is not configured");
    const query = boundedQuery(input.query, 300);
    if (!query) throw new Error("SEO query is required");

    const url = new URL("/api/v2/search", provider.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("engine", "google");
    const location = boundedQuery(input.location, 120);
    if (location) url.searchParams.set("location", location);

    const payload = await fetchProviderJson(url, {
      fetcher,
      allowedOrigin: provider.baseUrl,
      timeoutMs: 9_000,
      headers: { apikey: secret },
    });

    const organicRows = array(payload.organic);
    const organic = organicRows.slice(0, 12).flatMap((item) => {
      const link = httpsUrl(item.url);
      const title = boundedQuery(item.title, 300);
      if (!link || !title) return [];
      const position = Number(item.position);
      return [{
        position: Number.isFinite(position) ? Math.max(1, Math.min(100, Math.round(position))) : null,
        title,
        url: link,
        domain: domain(link),
      }];
    }).slice(0, 8);
    const relatedQuestions = organicRows.flatMap((item) => array(item.questions))
      .map((item) => boundedQuery(item.question, 240))
      .filter(Boolean)
      .slice(0, 8);

    if (!organic.length && !relatedQuestions.length) return { data: [] };
    return { data: [{
      kind: "seo-serp",
      organic,
      relatedQuestions,
      relatedSearches: [],
      resultCountEstimate: null,
      resultCountMeaning: "search_engine_result_estimate_not_search_volume_or_keyword_difficulty",
      verificationStatus: "discovery_only",
    }] };
  };
}

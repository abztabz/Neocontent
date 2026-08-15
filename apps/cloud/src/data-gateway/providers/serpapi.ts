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

export function serpApiAdapter(
  apiKey: string,
  fetcher?: ProviderFetcher,
): GatewayAdapter {
  const secret = apiKey.trim();
  return async (input, provider) => {
    if (!secret) throw new Error("SerpApi key is not configured");
    const query = boundedQuery(input.query, 300);
    if (!query) throw new Error("SEO query is required");

    const url = new URL("/search.json", provider.baseUrl);
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", secret);
    const location = boundedQuery(input.location, 120);
    const language = boundedQuery(input.language, 12).toLocaleLowerCase();
    const country = boundedQuery(input.country, 4).toLocaleLowerCase();
    if (location) url.searchParams.set("location", location);
    if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(language)) url.searchParams.set("hl", language.slice(0, 2));
    if (/^[a-z]{2}$/.test(country)) url.searchParams.set("gl", country);

    const payload = await fetchProviderJson(url, {
      fetcher,
      allowedOrigin: provider.baseUrl,
      timeoutMs: 9_000,
    });

    const organic = array(payload.organic_results).slice(0, 8).flatMap((item) => {
      const link = httpsUrl(item.link);
      const title = boundedQuery(item.title, 300);
      if (!link || !title) return [];
      const position = Number(item.position);
      return [{
        position: Number.isFinite(position) ? Math.max(1, Math.min(100, Math.round(position))) : null,
        title,
        url: link,
        domain: domain(link),
      }];
    });

    const relatedQuestions = array(payload.related_questions)
      .map((item) => boundedQuery(item.question, 240))
      .filter(Boolean)
      .slice(0, 8);
    const relatedSearches = array(payload.related_searches)
      .map((item) => boundedQuery(item.query, 240))
      .filter(Boolean)
      .slice(0, 8);
    const searchInformation = payload.search_information && typeof payload.search_information === "object" && !Array.isArray(payload.search_information)
      ? payload.search_information as Record<string, unknown>
      : {};
    const totalResults = Number(searchInformation.total_results);

    const snapshot = {
      kind: "seo-serp",
      organic,
      relatedQuestions,
      relatedSearches,
      resultCountEstimate: Number.isFinite(totalResults) ? Math.max(0, Math.round(totalResults)) : null,
      resultCountMeaning: "search_engine_result_estimate_not_search_volume_or_keyword_difficulty",
      verificationStatus: "discovery_only",
    };
    if (!organic.length && !relatedQuestions.length && !relatedSearches.length) return { data: [] };
    return { data: [snapshot] };
  };
}

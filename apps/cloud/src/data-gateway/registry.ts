export type ProviderStatus = "approved" | "experimental" | "blocked" | "retired";
export type CommercialUseStatus = "approved" | "review_required" | "blocked";
export type AdapterStatus = "live" | "implemented" | "planned" | "not_applicable";
export type SourceQuality = "official" | "primary" | "aggregator" | "community";

export interface SourceProvider {
  id: string;
  name: string;
  category: string;
  capabilities: string[];
  status: ProviderStatus;
  auth: "none" | "optional-contact" | "api-key" | "oauth" | "user-agent";
  baseUrl: string;
  commercialUse: CommercialUseStatus;
  freeTierUse: "production_allowed" | "evaluation_only" | "not_available" | "not_applicable" | "unknown";
  sourceQuality: SourceQuality;
  priority: number;
  adapterStatus: AdapterStatus;
  secretEnvName?: string;
  attribution?: string;
  quota?: string;
  freshnessPolicy: string;
  regionCoverage: string[];
  dataBoundary: string;
  termsUrl: string;
  documentationUrl: string;
  reviewedAt: string;
  reviewNotes?: string;
}

const reviewedAt = "2026-08-15";

export const sourceRegistry: readonly SourceProvider[] = Object.freeze([
  {
    id: "gdelt-doc", name: "GDELT DOC 2.0", category: "news", capabilities: ["news-discovery"],
    status: "approved", auth: "none", baseUrl: "https://api.gdeltproject.org", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "aggregator", priority: 10, adapterStatus: "live",
    attribution: "GDELT Project", freshnessPolicy: "query-window", regionCoverage: ["global"],
    dataBoundary: "Discovery metadata only. Linked publisher content is not licensed by GDELT and must be independently verified.",
    termsUrl: "https://www.gdeltproject.org/about.html#termsofuse", documentationUrl: "https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/", reviewedAt,
  },
  {
    id: "crossref", name: "Crossref REST API", category: "scholarly", capabilities: ["scholarly-discovery"],
    status: "approved", auth: "optional-contact", baseUrl: "https://api.crossref.org", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "primary", priority: 10, adapterStatus: "live",
    freshnessPolicy: "deposit-metadata", regionCoverage: ["global"],
    dataBoundary: "Bibliographic metadata only. Do not ingest abstracts or assume full-text rights.",
    termsUrl: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-metadata-license-information/", documentationUrl: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/", reviewedAt,
  },
  {
    id: "datacite", name: "DataCite REST API", category: "scholarly", capabilities: ["scholarly-discovery"],
    status: "approved", auth: "none", baseUrl: "https://api.datacite.org", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "primary", priority: 20, adapterStatus: "live",
    attribution: "DataCite", freshnessPolicy: "doi-metadata", regionCoverage: ["global"],
    dataBoundary: "CC0 DOI metadata only. Linked resources remain subject to their own rights and must be independently verified.",
    termsUrl: "https://support.datacite.org/docs/datacite-data-file-use-policy", documentationUrl: "https://support.datacite.org/docs/api", reviewedAt,
  },
  {
    id: "sec-edgar", name: "SEC EDGAR", category: "company-data", capabilities: ["company-filings"],
    status: "approved", auth: "user-agent", baseUrl: "https://data.sec.gov", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "official", priority: 10, adapterStatus: "planned",
    quota: "Maximum 10 requests/second across SEC.gov; declared User-Agent required for automated access.",
    freshnessPolicy: "filings-typically-available-within-minutes", regionCoverage: ["US", "foreign-issuers-filing-with-SEC"],
    dataBoundary: "Public filing and submission data only. Respect SEC fair-access policy, caching headers and request-rate limits.",
    termsUrl: "https://www.sec.gov/about/developer-resources", documentationUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces", reviewedAt,
  },
  {
    id: "companies-house", name: "UK Companies House API", category: "company-data", capabilities: ["company-registry"],
    status: "approved", auth: "api-key", baseUrl: "https://api.company-information.service.gov.uk", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "official", priority: 10, adapterStatus: "planned", secretEnvName: "NEO_COMPANIES_HOUSE_KEY",
    quota: "600 requests per 5 minutes by default.", freshnessPolicy: "live-real-time-public-register", regionCoverage: ["UK"],
    dataBoundary: "Public Companies House records only. Credentials remain server-side and rate limits must be enforced.",
    termsUrl: "https://developer.company-information.service.gov.uk/developer-guidelines/", documentationUrl: "https://developer.company-information.service.gov.uk/", reviewedAt,
  },
  {
    id: "ecb-data-portal", name: "ECB Data Portal API", category: "economic-data", capabilities: ["economic-data", "fx-rates"],
    status: "approved", auth: "none", baseUrl: "https://data-api.ecb.europa.eu", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "official", priority: 10, adapterStatus: "planned", attribution: "Source: ECB statistics.",
    freshnessPolicy: "series-defined", regionCoverage: ["EU", "global-fx-reference-rates"],
    dataBoundary: "Public ESCB statistics only. Quote the source, do not silently modify statistics, and exclude third-party data unless its reuse rights are separately cleared.",
    termsUrl: "https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html", documentationUrl: "https://data.ecb.europa.eu/help/api/overview", reviewedAt,
  },
  {
    id: "world-bank-indicators", name: "World Bank Indicators API", category: "economic-data", capabilities: ["economic-data", "open-data"],
    status: "approved", auth: "none", baseUrl: "https://api.worldbank.org", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "official", priority: 20, adapterStatus: "planned", attribution: "The World Bank",
    freshnessPolicy: "dataset-defined", regionCoverage: ["global"],
    dataBoundary: "Use only datasets whose metadata permits reuse. Default World Bank datasets are generally CC BY 4.0, but third-party indicators may carry separate restrictions.",
    termsUrl: "https://www.worldbank.org/ext/en/legal/terms-conditions/datasets", documentationUrl: "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation", reviewedAt,
  },
  {
    id: "data-gov-catalog", name: "Data.gov Catalog API", category: "government-open-data", capabilities: ["government-open-data-discovery"],
    status: "approved", auth: "api-key", baseUrl: "https://api.gsa.gov", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "official", priority: 10, adapterStatus: "planned", secretEnvName: "NEO_DATA_GOV_KEY",
    freshnessPolicy: "catalog-metadata", regionCoverage: ["US"],
    dataBoundary: "Dataset-catalog metadata only. Underlying datasets retain agency-specific licences and must be reviewed separately before reuse.",
    termsUrl: "https://api.data.gov/terms/", documentationUrl: "https://resources.data.gov/catalog-api/", reviewedAt,
  },
  {
    id: "met-norway-weather", name: "MET Norway WeatherAPI", category: "weather", capabilities: ["weather-forecast"],
    status: "approved", auth: "user-agent", baseUrl: "https://api.met.no", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "official", priority: 10, adapterStatus: "planned", attribution: "MET Norway / source dataset attribution required",
    freshnessPolicy: "forecast-product-defined", regionCoverage: ["global-location-forecast", "norway-specialist-products"],
    dataBoundary: "Open weather data under the documented licence. Send an identifying User-Agent, attribute the source, cache responsibly, and do not send confidential location data.",
    termsUrl: "https://api.met.no/doc/TermsOfService", documentationUrl: "https://api.met.no/weatherapi/documentation", reviewedAt,
  },
  {
    id: "google-public-dns", name: "Google Public DNS JSON API", category: "network", capabilities: ["dns-resolution"],
    status: "approved", auth: "none", baseUrl: "https://dns.google", commercialUse: "approved",
    freeTierUse: "production_allowed", sourceQuality: "official", priority: 10, adapterStatus: "planned",
    quota: "Free service with rate limiting and no SLA; high-volume clients must plan fallback resolvers.", freshnessPolicy: "dns-ttl", regionCoverage: ["global"],
    dataBoundary: "DNS resolution only. Do not submit confidential domain names; Google temporarily logs client IP and query details under its Public DNS privacy policy.",
    termsUrl: "https://developers.google.com/speed/public-dns/terms", documentationUrl: "https://developers.google.com/speed/public-dns/docs/doh/json", reviewedAt,
  },

  {
    id: "fred", name: "FRED", category: "economic-data", capabilities: ["economic-data"],
    status: "experimental", auth: "api-key", baseUrl: "https://api.stlouisfed.org", commercialUse: "review_required",
    freeTierUse: "unknown", sourceQuality: "official", priority: 30, adapterStatus: "planned", secretEnvName: "NEO_FRED_KEY",
    freshnessPolicy: "release-date", regionCoverage: ["US", "selected-global-series"],
    dataBoundary: "Candidate only until dataset-level licensing and redistribution constraints are enforced by the adapter.",
    termsUrl: "https://fred.stlouisfed.org/legal/", documentationUrl: "https://fred.stlouisfed.org/docs/api/fred/", reviewedAt,
  },
  {
    id: "serpapi", name: "SerpApi Google Search API", category: "seo", capabilities: ["seo-serp-discovery"],
    status: "experimental", auth: "api-key", baseUrl: "https://serpapi.com", commercialUse: "review_required",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 10, adapterStatus: "live", secretEnvName: "NEO_SERPAPI_KEY",
    freshnessPolicy: "live-or-provider-cache", regionCoverage: ["global"],
    dataBoundary: "SERP metadata only: rankings, result URLs, related questions/searches and coarse result-count estimates. Result counts are not search volume or keyword difficulty.",
    termsUrl: "https://serpapi.com/legal", documentationUrl: "https://serpapi.com/search-api", reviewedAt,
  },
  {
    id: "zenserp", name: "Zenserp Google Search API", category: "seo", capabilities: ["seo-serp-discovery"],
    status: "experimental", auth: "api-key", baseUrl: "https://app.zenserp.com", commercialUse: "review_required",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 20, adapterStatus: "live", secretEnvName: "NEO_ZENSERP_KEY",
    freshnessPolicy: "live-serp", regionCoverage: ["global"],
    dataBoundary: "SERP metadata only. Snippets and descriptions are excluded from Neo payloads.",
    termsUrl: "https://zenserp.com/terms", documentationUrl: "https://app.zenserp.com/documentation", reviewedAt,
  },
  {
    id: "serper", name: "Serper Google Search API", category: "seo", capabilities: ["seo-serp-discovery"],
    status: "experimental", auth: "api-key", baseUrl: "https://google.serper.dev", commercialUse: "review_required",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 30, adapterStatus: "planned", secretEnvName: "NEO_SERPER_KEY",
    freshnessPolicy: "live-serp", regionCoverage: ["global"],
    dataBoundary: "Candidate only until its commercial-use terms and normalized adapter contract are fully cleared.",
    termsUrl: "https://serper.dev/terms", documentationUrl: "https://serper.dev/", reviewedAt,
  },
  {
    id: "arbeitnow-jobs", name: "Arbeitnow Job Board API", category: "jobs", capabilities: ["jobs-discovery"],
    status: "experimental", auth: "none", baseUrl: "https://www.arbeitnow.com", commercialUse: "review_required",
    freeTierUse: "unknown", sourceQuality: "aggregator", priority: 10, adapterStatus: "planned",
    freshnessPolicy: "current-job-board", regionCoverage: ["Europe", "remote"],
    dataBoundary: "Public job-discovery metadata only. Ongoing commercial reuse rights must be confirmed before production approval.",
    termsUrl: "https://www.arbeitnow.com/terms", documentationUrl: "https://www.arbeitnow.com/blog/job-board-api", reviewedAt,
  },
  {
    id: "adzuna-jobs", name: "Adzuna API", category: "jobs", capabilities: ["jobs-discovery"],
    status: "experimental", auth: "api-key", baseUrl: "https://api.adzuna.com", commercialUse: "review_required",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 20, adapterStatus: "planned", secretEnvName: "NEO_ADZUNA_KEY",
    quota: "Default: 25/minute, 250/day, 1000/week, 2500/month.", freshnessPolicy: "provider-defined", regionCoverage: ["multiple-countries"],
    dataBoundary: "Publishing listings is permitted under attribution requirements; other ongoing commercial organisational uses may require written consent or a licence after the trial period.",
    termsUrl: "https://developer.adzuna.com/docs/terms_of_service", documentationUrl: "https://developer.adzuna.com/", reviewedAt,
  },
  {
    id: "alpha-vantage", name: "Alpha Vantage", category: "market-data", capabilities: ["market-data", "fx-rates", "crypto-market-data"],
    status: "experimental", auth: "api-key", baseUrl: "https://www.alphavantage.co", commercialUse: "review_required",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 20, adapterStatus: "planned", secretEnvName: "NEO_ALPHA_VANTAGE_KEY",
    quota: "Free key currently allows up to 25 requests/day; real-time regulated market data requires separate entitlement.", freshnessPolicy: "endpoint-and-entitlement-defined", regionCoverage: ["global-markets"],
    dataBoundary: "Do not use free or personal entitlements for Neo commercial production. Commercial market-data rights require provider clearance and may involve exchange licensing.",
    termsUrl: "https://www.alphavantage.co/terms_of_service/", documentationUrl: "https://www.alphavantage.co/documentation/", reviewedAt,
  },
  {
    id: "twelve-data", name: "Twelve Data", category: "market-data", capabilities: ["market-data", "fx-rates", "crypto-market-data"],
    status: "experimental", auth: "api-key", baseUrl: "https://api.twelvedata.com", commercialUse: "review_required",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 30, adapterStatus: "planned", secretEnvName: "NEO_TWELVE_DATA_KEY",
    freshnessPolicy: "subscription-defined", regionCoverage: ["global-markets"],
    dataBoundary: "Free-tier data is not for commercial use. Redistribution/external display requires the relevant subscription rights or a separate agreement.",
    termsUrl: "https://twelvedata.com/terms", documentationUrl: "https://twelvedata.com/docs", reviewedAt,
  },
  {
    id: "coingecko", name: "CoinGecko API", category: "market-data", capabilities: ["crypto-market-data"],
    status: "experimental", auth: "api-key", baseUrl: "https://api.coingecko.com", commercialUse: "review_required",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 10, adapterStatus: "planned", secretEnvName: "NEO_COINGECKO_KEY",
    freshnessPolicy: "plan-defined", regionCoverage: ["global-crypto"],
    dataBoundary: "Commercial use and redistribution rights depend on plan and licence. Raw data must not be resold or redistributed without appropriate rights.",
    termsUrl: "https://www.coingecko.com/en/terms", documentationUrl: "https://docs.coingecko.com/", reviewedAt,
  },
  {
    id: "tmdb", name: "The Movie Database API", category: "entertainment", capabilities: ["entertainment-metadata"],
    status: "experimental", auth: "api-key", baseUrl: "https://api.themoviedb.org", commercialUse: "review_required",
    freeTierUse: "evaluation_only", sourceQuality: "community", priority: 10, adapterStatus: "planned", secretEnvName: "NEO_TMDB_KEY",
    freshnessPolicy: "community-database", regionCoverage: ["global"],
    dataBoundary: "Developer API is free for non-commercial use with attribution. Commercial Neo use requires a commercial agreement; image rights are not implied by API access.",
    termsUrl: "https://www.themoviedb.org/api-terms-of-use", documentationUrl: "https://developer.themoviedb.org/docs/getting-started", reviewedAt,
  },
  {
    id: "nominatim-public", name: "OpenStreetMap Nominatim Public API", category: "geodata", capabilities: ["geocoding"],
    status: "experimental", auth: "user-agent", baseUrl: "https://nominatim.openstreetmap.org", commercialUse: "review_required",
    freeTierUse: "evaluation_only", sourceQuality: "community", priority: 10, adapterStatus: "planned", attribution: "OpenStreetMap contributors",
    quota: "Absolute maximum 1 request/second; stricter limits apply to recurring bulk jobs.", freshnessPolicy: "openstreetmap-database", regionCoverage: ["global"],
    dataBoundary: "Public endpoint is capacity-limited, requires attribution/caching and must remain replaceable. Do not send personal/confidential address material or use it as a generic geocoding resale service.",
    termsUrl: "https://operations.osmfoundation.org/policies/nominatim/", documentationUrl: "https://nominatim.org/release-docs/latest/api/Overview/", reviewedAt,
  },
  {
    id: "open-meteo-free", name: "Open-Meteo Free API", category: "weather", capabilities: ["weather-forecast"],
    status: "experimental", auth: "none", baseUrl: "https://api.open-meteo.com", commercialUse: "blocked",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 20, adapterStatus: "planned", attribution: "Open-Meteo and underlying weather data sources",
    quota: "Free endpoint: non-commercial only; published limits include 10,000/day, 5,000/hour and 600/minute.", freshnessPolicy: "model-defined", regionCoverage: ["global"],
    dataBoundary: "Free hosted endpoint is not for commercial production. Self-hosting or a commercial subscription may be evaluated separately.",
    termsUrl: "https://open-meteo.com/en/terms", documentationUrl: "https://open-meteo.com/en/docs", reviewedAt,
  },

  {
    id: "serpstack", name: "serpstack", category: "seo", capabilities: ["seo-serp-discovery"],
    status: "blocked", auth: "api-key", baseUrl: "https://api.serpstack.com", commercialUse: "blocked",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 90, adapterStatus: "not_applicable",
    freshnessPolicy: "not-applicable", regionCoverage: ["global"],
    dataBoundary: "Not enabled for Neo commercial production under the currently reviewed licence boundary.",
    termsUrl: "https://serpstack.com/terms", documentationUrl: "https://serpstack.com/documentation", reviewedAt,
  },
  {
    id: "gnews-free", name: "GNews Free Plan", category: "news", capabilities: ["news-discovery"],
    status: "blocked", auth: "api-key", baseUrl: "https://gnews.io", commercialUse: "blocked",
    freeTierUse: "evaluation_only", sourceQuality: "aggregator", priority: 90, adapterStatus: "not_applicable",
    freshnessPolicy: "free-plan-delayed", regionCoverage: ["global"],
    dataBoundary: "Free plan is development/testing only and is not approved for Neo commercial production.",
    termsUrl: "https://gnews.io/terms", documentationUrl: "https://docs.gnews.io/", reviewedAt,
  },
  {
    id: "guardian-developer", name: "The Guardian Open Platform Developer Key", category: "news", capabilities: ["news-discovery"],
    status: "blocked", auth: "api-key", baseUrl: "https://content.guardianapis.com", commercialUse: "blocked",
    freeTierUse: "evaluation_only", sourceQuality: "primary", priority: 90, adapterStatus: "not_applicable",
    freshnessPolicy: "publisher-defined", regionCoverage: ["global-news"],
    dataBoundary: "Developer access is non-commercial. Commercial publishing, derived products and AI-related uses require separate commercial access.",
    termsUrl: "https://open-platform.theguardian.com/access/", documentationUrl: "https://open-platform.theguardian.com/documentation/", reviewedAt,
  },
]);

export function providersFor(capability: string, options: { includeExperimental?: boolean } = {}): SourceProvider[] {
  return sourceRegistry
    .filter((provider) => {
      if (!provider.capabilities.includes(capability)) return false;
      if (provider.status === "approved") return true;
      return options.includeExperimental === true && provider.status === "experimental";
    })
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

export function providerById(id: string): SourceProvider | undefined {
  return sourceRegistry.find((provider) => provider.id === id);
}

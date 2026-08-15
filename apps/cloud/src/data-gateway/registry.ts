export type ProviderStatus = "approved" | "experimental" | "blocked" | "retired";

export interface SourceProvider {
  id: string;
  name: string;
  capabilities: string[];
  status: ProviderStatus;
  auth: "none" | "optional-contact" | "api-key";
  baseUrl: string;
  commercialUse: "approved" | "review_required" | "blocked";
  attribution?: string;
  freshnessPolicy: string;
  dataBoundary: string;
}

export const sourceRegistry: readonly SourceProvider[] = Object.freeze([
  {
    id: "gdelt-doc",
    name: "GDELT DOC 2.0",
    capabilities: ["news-discovery"],
    status: "approved",
    auth: "none",
    baseUrl: "https://api.gdeltproject.org",
    commercialUse: "approved",
    attribution: "GDELT Project",
    freshnessPolicy: "query-window",
    dataBoundary: "Discovery metadata only. Linked publisher content is not licensed by GDELT and must be independently verified.",
  },
  {
    id: "crossref",
    name: "Crossref REST API",
    capabilities: ["scholarly-discovery"],
    status: "approved",
    auth: "optional-contact",
    baseUrl: "https://api.crossref.org",
    commercialUse: "approved",
    freshnessPolicy: "deposit-metadata",
    dataBoundary: "Bibliographic metadata only. Do not ingest abstracts or assume full-text rights.",
  },
  {
    id: "datacite",
    name: "DataCite REST API",
    capabilities: ["scholarly-discovery"],
    status: "approved",
    auth: "none",
    baseUrl: "https://api.datacite.org",
    commercialUse: "approved",
    attribution: "DataCite",
    freshnessPolicy: "doi-metadata",
    dataBoundary: "CC0 DOI metadata only. Linked resources remain subject to their own rights and must be independently verified.",
  },
  {
    id: "sec-edgar",
    name: "SEC EDGAR",
    capabilities: ["company-filings"],
    status: "experimental",
    auth: "none",
    baseUrl: "https://data.sec.gov",
    commercialUse: "review_required",
    freshnessPolicy: "source-defined",
    dataBoundary: "Not enabled until a dedicated filing adapter and usage review are complete.",
  },
  {
    id: "fred",
    name: "FRED",
    capabilities: ["economic-data"],
    status: "experimental",
    auth: "api-key",
    baseUrl: "https://api.stlouisfed.org",
    commercialUse: "review_required",
    freshnessPolicy: "release-date",
    dataBoundary: "Not enabled until dataset-level licensing and adapter review are complete.",
  },
]);

export function providersFor(capability: string, options: { includeExperimental?: boolean } = {}): SourceProvider[] {
  return sourceRegistry.filter((provider) => {
    if (!provider.capabilities.includes(capability)) return false;
    if (provider.status === "approved") return true;
    return options.includeExperimental === true && provider.status === "experimental";
  });
}

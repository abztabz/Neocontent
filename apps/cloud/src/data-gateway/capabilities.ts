import { sourceRegistry, type SourceProvider } from "./registry.js";

export type CapabilityReadiness = "ready" | "experimental" | "gap";

export interface CapabilityDefinition {
  id: string;
  label: string;
  purpose: string;
  readiness: CapabilityReadiness;
  privacyClass: "public-data-only" | "public-query-metadata";
  consumerExamples: string[];
}

export const capabilityRegistry: readonly CapabilityDefinition[] = Object.freeze([
  { id: "news-discovery", label: "News discovery", purpose: "Locate timely public-news leads without treating aggregator metadata as factual evidence.", readiness: "ready", privacyClass: "public-query-metadata", consumerExamples: ["NeoContent", "Living Website"] },
  { id: "scholarly-discovery", label: "Scholarly discovery", purpose: "Locate bibliographic records and research candidates.", readiness: "ready", privacyClass: "public-query-metadata", consumerExamples: ["NeoContent", "Living Website"] },
  { id: "seo-serp-discovery", label: "SERP intelligence", purpose: "Observe ranking pages, related questions and current search language without claiming search volume.", readiness: "experimental", privacyClass: "public-query-metadata", consumerExamples: ["NeoContent"] },
  { id: "company-filings", label: "Company filings", purpose: "Retrieve official public issuer filings and submission metadata.", readiness: "ready", privacyClass: "public-data-only", consumerExamples: ["NeoCRM", "NeoOS Wealth", "NeoContent"] },
  { id: "company-registry", label: "Company registry", purpose: "Retrieve official public corporate-register data where a governed national source exists.", readiness: "ready", privacyClass: "public-data-only", consumerExamples: ["NeoCRM"] },
  { id: "economic-data", label: "Economic data", purpose: "Retrieve official macroeconomic and development indicators.", readiness: "ready", privacyClass: "public-data-only", consumerExamples: ["NeoOS Wealth", "NeoContent"] },
  { id: "fx-rates", label: "Foreign exchange rates", purpose: "Retrieve official reference FX series and normalized cross-rate inputs.", readiness: "ready", privacyClass: "public-data-only", consumerExamples: ["NeoOS Wealth", "NeoCRM"] },
  { id: "open-data", label: "Open datasets", purpose: "Retrieve governed open statistical datasets whose dataset-level rights permit reuse.", readiness: "ready", privacyClass: "public-data-only", consumerExamples: ["NeoOS Wealth", "NeoContent", "Living Website"] },
  { id: "government-open-data-discovery", label: "Government open-data discovery", purpose: "Search official government dataset catalogues while preserving dataset-specific licensing boundaries.", readiness: "ready", privacyClass: "public-query-metadata", consumerExamples: ["NeoContent", "NeoCRM", "Living Website"] },
  { id: "weather-forecast", label: "Weather forecast", purpose: "Retrieve governed public weather forecasts for location-based product features.", readiness: "ready", privacyClass: "public-query-metadata", consumerExamples: ["Living Website", "NeoOS"] },
  { id: "dns-resolution", label: "DNS resolution", purpose: "Resolve public DNS records for validation and infrastructure checks.", readiness: "ready", privacyClass: "public-query-metadata", consumerExamples: ["NeoCRM", "Living Website", "NeoContent"] },
  { id: "jobs-discovery", label: "Jobs discovery", purpose: "Locate public job listings through licensed or explicitly permitted feeds.", readiness: "experimental", privacyClass: "public-query-metadata", consumerExamples: ["NeoOS relocation", "Living Website"] },
  { id: "market-data", label: "Securities market data", purpose: "Retrieve equities, ETF and index pricing/fundamental data with commercial redistribution rights.", readiness: "experimental", privacyClass: "public-data-only", consumerExamples: ["NeoOS Wealth"] },
  { id: "crypto-market-data", label: "Crypto market data", purpose: "Retrieve crypto pricing and market metadata under a commercial-use licence.", readiness: "experimental", privacyClass: "public-data-only", consumerExamples: ["NeoOS Wealth"] },
  { id: "entertainment-metadata", label: "Entertainment metadata", purpose: "Retrieve movie, television and related metadata where commercial rights are cleared.", readiness: "experimental", privacyClass: "public-query-metadata", consumerExamples: ["NeoContent", "Living Website"] },
  { id: "geocoding", label: "Geocoding", purpose: "Convert public place/address queries to coordinates without sending confidential location material.", readiness: "experimental", privacyClass: "public-query-metadata", consumerExamples: ["NeoCRM", "Living Website"] },
  { id: "language-translation", label: "Language translation", purpose: "Translate bounded product text using a provider whose commercial, privacy and retention terms are cleared.", readiness: "gap", privacyClass: "public-query-metadata", consumerExamples: ["Living Website", "NeoContent"] },
  { id: "email-validation", label: "Email validation", purpose: "Validate addresses without leaking CRM personal data to an unapproved third party.", readiness: "gap", privacyClass: "public-query-metadata", consumerExamples: ["NeoCRM"] },
]);

export function capabilityById(id: string): CapabilityDefinition | undefined {
  return capabilityRegistry.find((capability) => capability.id === id);
}

export function providersForCapability(id: string): SourceProvider[] {
  return sourceRegistry.filter((provider) => provider.capabilities.includes(id));
}

export function safeRegistrySnapshot() {
  return capabilityRegistry.map((capability) => ({
    ...capability,
    providers: providersForCapability(capability.id).map((provider) => ({
      id: provider.id,
      name: provider.name,
      status: provider.status,
      commercialUse: provider.commercialUse,
      freeTierUse: provider.freeTierUse,
      sourceQuality: provider.sourceQuality,
      adapterStatus: provider.adapterStatus,
      regionCoverage: provider.regionCoverage,
      reviewedAt: provider.reviewedAt,
    })),
  }));
}

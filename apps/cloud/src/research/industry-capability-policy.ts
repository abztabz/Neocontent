export type NeoContentResearchCapability =
  | "news-discovery"
  | "scholarly-discovery"
  | "seo-serp-discovery";

export type ResearchProfile = "general" | "evidence_heavy";

export interface ResearchCapabilityPlan {
  profile: ResearchProfile;
  capabilities: NeoContentResearchCapability[];
  reasons: string[];
}

const evidenceHeavyTerms = new Set([
  "academic", "agriculture", "biomedical", "climate", "clinical", "education",
  "environment", "environmental", "finance", "financial", "health", "healthcare",
  "legal", "law", "medical", "medicine", "mental", "nutrition", "pharma",
  "pharmaceutical", "psychology", "regulatory", "research", "science", "scientific",
  "therapy", "university", "wellness",
]);

function normalizedWords(values: unknown[]): Set<string> {
  const text = values.flatMap((value) => Array.isArray(value) ? value : [value])
    .map(String)
    .join(" ")
    .toLocaleLowerCase();
  return new Set(text.match(/[a-z0-9]{3,}/g) ?? []);
}

/**
 * Selects product capabilities, never providers. Provider eligibility, priority,
 * licensing, health and fallback remain owned by the NeoOS Source Registry.
 */
export function selectResearchCapabilities(input: {
  industry?: unknown;
  services?: unknown;
  topic?: unknown;
  experimentalSeoEnabled?: boolean;
}): ResearchCapabilityPlan {
  const words = normalizedWords([input.industry, input.services, input.topic]);
  const evidenceHeavy = [...words].some((word) => evidenceHeavyTerms.has(word));
  const capabilities: NeoContentResearchCapability[] = ["news-discovery"];
  const reasons = ["current_public_context"];

  if (evidenceHeavy) {
    capabilities.push("scholarly-discovery");
    reasons.push("evidence_heavy_customer_context");
  }
  if (input.experimentalSeoEnabled === true) {
    capabilities.push("seo-serp-discovery");
    reasons.push("operator_enabled_experimental_seo");
  }

  return {
    profile: evidenceHeavy ? "evidence_heavy" : "general",
    capabilities,
    reasons,
  };
}

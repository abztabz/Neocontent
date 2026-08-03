export type OpportunityStream = "business" | "customer_demand" | "industry" | "timely_industry";

export interface ContentOpportunity {
  stream: OpportunityStream;
  title: string;
  rationale: string;
  searchIntent: string;
  scores: {
    businessRelevance: number;
    authorityGain: number;
    evidenceReadiness: number;
    freshness: number;
    risk: number;
  };
  overallScore: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function score(input: Omit<ContentOpportunity, "overallScore">): ContentOpportunity {
  const s = input.scores;
  const overallScore = clamp(
    s.businessRelevance * 0.3
      + s.authorityGain * 0.25
      + s.evidenceReadiness * 0.25
      + s.freshness * 0.1
      + (100 - s.risk) * 0.1,
  );
  return { ...input, overallScore };
}

export function generateOpportunities(input: {
  businessName: string;
  industry: string;
  audience: string;
  services: string[];
  contentMode: string;
  evidenceCount: number;
  existingTitles: string[];
}): ContentOpportunity[] {
  const service = input.services[0] || input.industry || "the service";
  const industry = input.industry || "the industry";
  const audience = input.audience || "customers";
  const candidates: ContentOpportunity[] = [
    score({
      stream: "business",
      title: `How to Know When ${service} Is the Right Next Step`,
      rationale: `Answers a high-intent question for ${audience} while staying close to approved services.`,
      searchIntent: "informational-commercial",
      scores: { businessRelevance: 96, authorityGain: 72, evidenceReadiness: 82, freshness: 55, risk: 18 },
    }),
    score({
      stream: "industry",
      title: `What Is Changing in ${industry} and What It Means for ${audience}`,
      rationale: "Builds topical authority using current governed industry evidence.",
      searchIntent: "informational",
      scores: {
        businessRelevance: 82,
        authorityGain: 96,
        evidenceReadiness: input.evidenceCount > 1 ? 92 : 45,
        freshness: 88,
        risk: input.evidenceCount > 1 ? 24 : 65,
      },
    }),
    score({
      stream: "customer_demand",
      title: `A Practical Guide to Choosing ${service}`,
      rationale: `Helps ${audience} compare options and make a better-informed decision.`,
      searchIntent: "commercial-investigation",
      scores: { businessRelevance: 94, authorityGain: 80, evidenceReadiness: 78, freshness: 60, risk: 22 },
    }),
  ];

  const normalizedExisting = input.existingTitles.map((title) => title.toLowerCase());
  return candidates
    .filter((candidate) => !normalizedExisting.some((title) => title === candidate.title.toLowerCase()))
    .filter((candidate) => input.contentMode !== "business_focused" || candidate.stream !== "industry")
    .sort((a, b) => b.overallScore - a.overallScore);
}

export function selectOpportunity(opportunities: ContentOpportunity[]): ContentOpportunity {
  const selected = opportunities.find((opportunity) => opportunity.overallScore >= 70);
  if (!selected) throw new Error("No content opportunity meets the V1 publication threshold");
  return selected;
}

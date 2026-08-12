export type OpportunityStream = "business" | "customer_demand" | "industry" | "timely_industry";
export type Timeliness = "evergreen" | "seasonal" | "trending" | "breaking";

export interface ContentOpportunity {
  stream: OpportunityStream;
  title: string;
  headlineOptions: string[];
  rationale: string;
  whyNow: string;
  searchIntent: string;
  primaryKeyword: string;
  supportingKeywords: string[];
  keywordEvidence: "research_hypothesis" | "verified_first_party";
  timeliness: Timeliness;
  competitionEstimate: "low" | "medium" | "high" | "unknown";
  recommendedPublishBy: string;
  scores: {
    businessRelevance: number;
    audienceFit: number;
    authorityGain: number;
    evidenceReadiness: number;
    freshness: number;
    searchOpportunity: number;
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
    s.businessRelevance * 0.22
      + s.audienceFit * 0.18
      + s.authorityGain * 0.17
      + s.evidenceReadiness * 0.14
      + s.freshness * 0.1
      + s.searchOpportunity * 0.12
      + (100 - s.risk) * 0.07,
  );
  return { ...input, overallScore };
}

function keyword(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function publishBy(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

function terms(value: string): Set<string> {
  return new Set(keyword(value).split(" ").filter((item) => item.length > 2));
}

function substantiallyDuplicates(title: string, existingTitles: string[]): boolean {
  const candidate = terms(title);
  if (!candidate.size) return false;
  return existingTitles.some((existing) => {
    const previous = terms(existing);
    const overlap = [...candidate].filter((item) => previous.has(item)).length;
    return overlap / Math.min(candidate.size, Math.max(previous.size, 1)) >= 0.72;
  });
}

export function generateOpportunities(input: {
  businessName: string;
  industry: string;
  audience: string;
  services: string[];
  locations?: string[];
  contentMode: string;
  evidenceCount: number;
  existingTitles: string[];
  now?: Date;
}): ContentOpportunity[] {
  const now = input.now ?? new Date();
  const services = input.services.filter(Boolean).slice(0, 4);
  if (!services.length) services.push(input.industry || "the service");
  const industry = input.industry || "the industry";
  const audience = input.audience || "customers";
  const location = input.locations?.find(Boolean) ?? "";
  const month = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(now);
  const locationSuffix = location ? ` in ${location}` : "";

  const candidates: ContentOpportunity[] = [];
  for (const service of services) {
    const primary = keyword(`${service}${locationSuffix}`);
    candidates.push(score({
      stream: "customer_demand",
      title: `A Practical Guide to Choosing ${service}${locationSuffix}`,
      headlineOptions: [
        `How to Choose ${service}${locationSuffix}`,
        `${service}${locationSuffix}: What to Compare Before Deciding`,
        `Questions to Ask Before Choosing ${service}${locationSuffix}`,
      ],
      rationale: `Answers a decision-stage question for ${audience} while remaining tied to an approved service.`,
      whyNow: "Evergreen customer demand; Luna must verify the current search language and evidence before drafting.",
      searchIntent: "commercial-investigation",
      primaryKeyword: primary,
      supportingKeywords: [keyword(`how to choose ${service}`), keyword(`${service} guide`), keyword(`${service} questions`)],
      keywordEvidence: "research_hypothesis",
      timeliness: "evergreen",
      competitionEstimate: "unknown",
      recommendedPublishBy: publishBy(now, 21),
      scores: { businessRelevance: 96, audienceFit: 92, authorityGain: 82, evidenceReadiness: 78, freshness: 62, searchOpportunity: 84, risk: 20 },
    }));
    candidates.push(score({
      stream: "business",
      title: `When Is ${service} the Right Next Step${locationSuffix}?`,
      headlineOptions: [
        `How to Know When You Need ${service}${locationSuffix}`,
        `${service}${locationSuffix}: Signs It May Be the Right Next Step`,
        `Is ${service} Right for You? A Practical Checklist`,
      ],
      rationale: `Addresses high-intent questions from ${audience} without inventing customer capabilities.`,
      whyNow: "Strong evergreen intent close to the customer's approved services.",
      searchIntent: "informational-commercial",
      primaryKeyword: keyword(`when to use ${service}`),
      supportingKeywords: [keyword(`${service} benefits`), keyword(`do I need ${service}`), keyword(`${service} checklist`)],
      keywordEvidence: "research_hypothesis",
      timeliness: "evergreen",
      competitionEstimate: "unknown",
      recommendedPublishBy: publishBy(now, 21),
      scores: { businessRelevance: 97, audienceFit: 90, authorityGain: 76, evidenceReadiness: 80, freshness: 58, searchOpportunity: 82, risk: 18 },
    }));
  }

  candidates.push(score({
    stream: "timely_industry",
    title: `${industry} in ${month}: What ${audience} Should Know`,
    headlineOptions: [
      `What Is Changing in ${industry} in ${month}`,
      `${month} ${industry} Update for ${audience}`,
      `The ${industry} Developments Worth Watching Now`,
    ],
    rationale: "Creates a current-industry opportunity that must earn publication through fresh authoritative evidence.",
    whyNow: `Time-specific opportunity for ${month}; Luna must confirm that a material current development exists before writing.`,
    searchIntent: "current-informational",
    primaryKeyword: keyword(`${industry} ${month}`),
    supportingKeywords: [keyword(`${industry} news`), keyword(`${industry} trends`), keyword(`${industry} update`)],
    keywordEvidence: "research_hypothesis",
    timeliness: "trending",
    competitionEstimate: "unknown",
    recommendedPublishBy: publishBy(now, 7),
    scores: {
      businessRelevance: 82, audienceFit: 88, authorityGain: 96,
      evidenceReadiness: input.evidenceCount > 1 ? 90 : 55,
      freshness: 98, searchOpportunity: 86, risk: input.evidenceCount > 1 ? 24 : 48,
    },
  }));

  return candidates
    .filter((candidate) => !substantiallyDuplicates(candidate.title, input.existingTitles))
    .filter((candidate) => input.contentMode !== "business_focused" || !["industry", "timely_industry"].includes(candidate.stream))
    .sort((a, b) => b.overallScore - a.overallScore);
}

export function selectOpportunity(opportunities: ContentOpportunity[]): ContentOpportunity {
  const selected = opportunities.find((opportunity) => opportunity.overallScore >= 70);
  if (!selected) throw new Error("No distinct content opportunity meets the publication threshold");
  return selected;
}


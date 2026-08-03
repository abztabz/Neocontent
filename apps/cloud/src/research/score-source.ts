import type { ExtractedSource } from "./extract-source.js";

export type SourceType =
  | "government"
  | "regulator"
  | "academic"
  | "professional_association"
  | "standards_body"
  | "first_party"
  | "reputable_news"
  | "industry_publication"
  | "general_web";

export interface SourceAssessment {
  sourceType: SourceType;
  trustScore: number;
  freshnessScore: number;
  freshnessStatus: "current" | "aging" | "stale" | "unknown";
  approvedForClaims: boolean;
  reasons: string[];
}

const GOVERNMENT_SUFFIXES = [".gov", ".gov.uk", ".gov.au", ".govt.nz", ".gc.ca"];
const ACADEMIC_SUFFIXES = [".edu", ".ac.uk", ".edu.au", ".ac.nz"];

function classify(hostname: string): SourceType {
  const host = hostname.toLowerCase();
  if (GOVERNMENT_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))) {
    return "government";
  }
  if (ACADEMIC_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))) {
    return "academic";
  }
  if (/who\.int$|oecd\.org$|iso\.org$|iec\.ch$/.test(host)) return "standards_body";
  return "general_web";
}

function baseTrust(type: SourceType): number {
  switch (type) {
    case "government":
    case "regulator":
      return 92;
    case "academic":
      return 88;
    case "standards_body":
      return 90;
    case "professional_association":
      return 82;
    case "first_party":
      return 74;
    case "reputable_news":
      return 76;
    case "industry_publication":
      return 70;
    default:
      return 50;
  }
}

function assessFreshness(publishedAt?: string): Pick<SourceAssessment, "freshnessScore" | "freshnessStatus"> {
  if (!publishedAt) return { freshnessScore: 45, freshnessStatus: "unknown" };
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return { freshnessScore: 45, freshnessStatus: "unknown" };
  const ageDays = Math.max(0, (Date.now() - published) / 86_400_000);
  if (ageDays <= 365) return { freshnessScore: 100, freshnessStatus: "current" };
  if (ageDays <= 1_095) return { freshnessScore: 75, freshnessStatus: "aging" };
  return { freshnessScore: 40, freshnessStatus: "stale" };
}

export function scoreSource(source: ExtractedSource): SourceAssessment {
  const url = new URL(source.canonicalUrl);
  const sourceType = classify(url.hostname);
  const reasons: string[] = [`classified as ${sourceType}`];
  let trustScore = baseTrust(sourceType);

  if (source.publisher) {
    trustScore += 3;
    reasons.push("publisher metadata present");
  }
  if (source.publishedAt) {
    trustScore += 2;
    reasons.push("publication date present");
  }
  if (source.warnings.length > 0) {
    trustScore -= Math.min(30, source.warnings.length * 15);
    reasons.push("suspicious instruction-like content detected");
  }

  const freshness = assessFreshness(source.publishedAt);
  trustScore = Math.max(0, Math.min(100, trustScore));

  return {
    sourceType,
    trustScore,
    ...freshness,
    approvedForClaims:
      trustScore >= 70 &&
      freshness.freshnessStatus !== "stale" &&
      source.warnings.length === 0,
    reasons,
  };
}

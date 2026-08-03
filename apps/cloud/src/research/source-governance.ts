import type { ExtractedEvidence } from "./extractor.js";

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

const TRUST_BASE: Record<SourceType, number> = {
  government: 96,
  regulator: 96,
  academic: 92,
  professional_association: 88,
  standards_body: 94,
  first_party: 75,
  reputable_news: 78,
  industry_publication: 72,
  general_web: 45,
};

const GOVERNMENT_SUFFIXES = [".gov", ".gov.uk", ".gov.au", ".govt.nz", ".gc.ca"];
const ACADEMIC_SUFFIXES = [".edu", ".ac.uk", ".edu.au", ".ac.nz"];

export interface GovernedSource {
  sourceType: SourceType;
  trustScore: number;
  freshness: "current" | "aging" | "stale" | "unknown";
  approvedForClaims: boolean;
  rejectionReasons: string[];
}

function classify(hostname: string): SourceType {
  const host = hostname.toLowerCase();
  if (GOVERNMENT_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "government";
  if (ACADEMIC_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "academic";
  if (/\b(iso|who|oecd)\b/.test(host)) return "standards_body";
  return "general_web";
}

function freshness(publishedAt?: string): GovernedSource["freshness"] {
  if (!publishedAt) return "unknown";
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return "unknown";
  const ageDays = (Date.now() - timestamp) / 86_400_000;
  if (ageDays <= 730) return "current";
  if (ageDays <= 1_825) return "aging";
  return "stale";
}

export function governSource(url: string, evidence: ExtractedEvidence): GovernedSource {
  const sourceType = classify(new URL(url).hostname);
  let trustScore = TRUST_BASE[sourceType];
  const rejectionReasons: string[] = [];
  if (evidence.injectionSignals.length) {
    trustScore -= 40;
    rejectionReasons.push("Source contains instruction-like content that may be prompt injection");
  }
  if (evidence.text.length < 300) {
    trustScore -= 20;
    rejectionReasons.push("Source contains insufficient extractable evidence");
  }
  if (!evidence.publisher) trustScore -= 4;
  const freshnessStatus = freshness(evidence.publishedAt);
  if (freshnessStatus === "stale") trustScore -= 12;
  trustScore = Math.max(0, Math.min(100, trustScore));
  return {
    sourceType,
    trustScore,
    freshness: freshnessStatus,
    approvedForClaims: trustScore >= 70 && evidence.injectionSignals.length === 0,
    rejectionReasons,
  };
}

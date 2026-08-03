export type FreshnessStatus = "current" | "aging" | "stale" | "unknown";

export interface SourceEvidence {
  id: string;
  url: string;
  title: string;
  publisher: string;
  trustScore: number;
  freshness: FreshnessStatus;
  excerpts: string[];
  sourceType?: string;
}

export interface EvidencePackage {
  sources: SourceEvidence[];
  publishable: boolean;
  reasons: string[];
}

export function buildEvidencePackage(sources: SourceEvidence[]): EvidencePackage {
  const eligible = sources.filter(
    (source) => source.trustScore >= 60 && source.freshness !== "stale" && source.excerpts.length > 0,
  );

  const reasons: string[] = [];
  if (eligible.length === 0) {
    reasons.push("No approved source meets the minimum trust and freshness requirements.");
  }

  return {
    sources: eligible,
    publishable: eligible.length > 0,
    reasons,
  };
}

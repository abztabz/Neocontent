export interface EvidenceSource {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  publishedAt?: string;
  trustScore: number;
  freshness: "current" | "aging" | "stale" | "unknown";
  text: string;
}

export interface MaterialClaim {
  id: string;
  text: string;
  category: "business" | "industry" | "timely" | "general_guidance";
  sourceIds: string[];
}

export interface ClaimVerification {
  claimId: string;
  supported: boolean;
  confidence: number;
  reasons: string[];
}

function meaningfulTerms(text: string): string[] {
  const stop = new Set(["that", "this", "with", "from", "have", "will", "their", "about", "into", "than", "when", "where", "which", "your", "they", "them", "were", "been", "being", "also"]);
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].filter((term) => !stop.has(term));
}

function lexicalSupport(claim: string, source: string): number {
  const terms = meaningfulTerms(claim);
  if (!terms.length) return 0;
  const haystack = source.toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length / terms.length;
}

export function verifyClaims(claims: MaterialClaim[], sources: EvidenceSource[]): ClaimVerification[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return claims.map((claim) => {
    if (claim.category === "general_guidance" && claim.sourceIds.length === 0) {
      return { claimId: claim.id, supported: true, confidence: 65, reasons: ["General guidance does not make a material external factual claim"] };
    }
    const linked = claim.sourceIds.map((id) => byId.get(id)).filter((value): value is EvidenceSource => Boolean(value));
    const reasons: string[] = [];
    if (!linked.length) return { claimId: claim.id, supported: false, confidence: 0, reasons: ["No evidence source is linked to the claim"] };
    const eligible = linked.filter((source) => source.trustScore >= 70 && source.freshness !== "stale");
    if (!eligible.length) reasons.push("Linked sources do not meet trust and freshness thresholds");
    const strongest = eligible.reduce((best, source) => Math.max(best, lexicalSupport(claim.text, source.text)), 0);
    if (strongest < 0.35) reasons.push("The linked evidence does not contain enough of the claim's material terms");
    if (claim.category === "timely" && !eligible.some((source) => source.freshness === "current")) {
      reasons.push("Time-sensitive claim lacks a current source");
    }
    const supported = eligible.length > 0 && strongest >= 0.35 && reasons.length === 0;
    return {
      claimId: claim.id,
      supported,
      confidence: Math.round(Math.min(100, strongest * 70 + Math.max(...eligible.map((source) => source.trustScore), 0) * 0.3)),
      reasons: supported ? ["Claim is linked to sufficiently trusted, fresh, and relevant evidence"] : reasons,
    };
  });
}

export function assertPublishable(verifications: ClaimVerification[]): void {
  const unsupported = verifications.filter((verification) => !verification.supported);
  if (unsupported.length) {
    throw new Error(`Publication blocked: ${unsupported.length} material claim(s) lack sufficient evidence`);
  }
}

import { SupabaseRepository } from "../db/supabase.js";
import { fetchSource } from "../research/fetch-source.js";
import { extractSource } from "../research/extract-source.js";
import { scoreSource } from "../research/score-source.js";

export interface AddSourceRequest {
  organizationId: string;
  siteId: string;
  url: string;
  label?: string;
  purpose: "business_knowledge" | "industry_research" | "preferred_research" | "topic_discovery_only";
}

function suggestedClaims(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 80 && sentence.length <= 500)
    .filter((sentence) => !/cookie|privacy policy|terms of use|subscribe|newsletter/i.test(sentence))
    .slice(0, 12);
}

export async function addSource(repository: SupabaseRepository, input: AddSourceRequest) {
  const purposes = new Set(["business_knowledge", "industry_research", "preferred_research", "topic_discovery_only"]);
  if (typeof input.url !== "string" || input.url.length > 2_048) throw new Error("Source URL is invalid");
  if (input.label !== undefined && (typeof input.label !== "string" || input.label.length > 200)) {
    throw new Error("Source label is invalid");
  }
  if (!purposes.has(input.purpose)) throw new Error("Source purpose is invalid");
  const pending = await repository.insertUserSource({
    organization_id: input.organizationId,
    site_id: input.siteId,
    url: input.url,
    label: input.label ?? "",
    purpose: input.purpose,
    status: "pending_fetch",
  });

  try {
    const fetched = await fetchSource(input.url);
    const extracted = extractSource(fetched);
    const assessment = scoreSource(extracted);
    const suggestions = suggestedClaims(extracted.text);

    return repository.updateUserSource(String(pending?.id), input.siteId, {
      status: "pending_review",
      url: extracted.canonicalUrl,
      publisher: extracted.publisher ?? null,
      published_at: extracted.publishedAt ?? null,
      retrieved_at: fetched.retrievedAt,
      trust_score: assessment.trustScore,
      freshness_status: assessment.freshnessStatus,
      extracted_text: extracted.text,
      suggested_claims: suggestions,
      content_fingerprint: extracted.fingerprint,
      failure_reason: extracted.warnings.length ? extracted.warnings.join("; ") : null,
    });
  } catch (error) {
    await repository.updateUserSource(String(pending?.id), input.siteId, {
      status: "fetch_failed",
      failure_reason: error instanceof Error ? error.message : String(error),
      retrieved_at: new Date().toISOString(),
    });
    throw error;
  }
}

export async function decideSource(
  repository: SupabaseRepository,
  siteId: string,
  sourceId: string,
  decision: "approve" | "reject",
  approvedClaims: string[] = [],
) {
  if (!/^[0-9a-f-]{36}$/i.test(sourceId)) throw new Error("Source identifier is invalid");
  if (decision !== "approve" && decision !== "reject") throw new Error("Source decision is invalid");
  if (!Array.isArray(approvedClaims) || approvedClaims.length > 20) throw new Error("Approved claims are invalid");
  const claims = approvedClaims.map((claim) => {
    if (typeof claim !== "string" || claim.length > 1_000) throw new Error("Approved claim is invalid");
    return claim.trim();
  }).filter(Boolean);
  const source = await repository.findUserSourceForSite(sourceId, siteId);
  if (!source) throw new Error("Source was not found for this site");
  if (decision === "approve") {
    if (source.status !== "pending_review") throw new Error("Source is not pending review");
    if (Number(source.trust_score ?? 0) < 70) throw new Error("Source does not meet the minimum trust threshold");
    if (/prompt-injection|system prompt|hidden instructions|role-assignment/i.test(String(source.failure_reason ?? ""))) {
      throw new Error("Source contains unsafe instruction-like content and cannot be approved");
    }
    const suggested = new Set(Array.isArray(source.suggested_claims) ? source.suggested_claims.map(String) : []);
    if (claims.some((claim) => !suggested.has(claim))) throw new Error("Approved claims must come from reviewed source suggestions");
  }
  return repository.updateUserSource(sourceId, siteId, {
    status: decision === "approve" ? "approved" : "rejected",
    approved_claims: decision === "approve" ? claims : [],
  });
}

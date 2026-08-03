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

export async function addSource(repository: SupabaseRepository, input: AddSourceRequest) {
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

    return repository.updateUserSource(String(pending?.id), {
      status: "pending_review",
      url: extracted.canonicalUrl,
      publisher: extracted.publisher ?? null,
      published_at: extracted.publishedAt ?? null,
      retrieved_at: fetched.retrievedAt,
      trust_score: assessment.trustScore,
      freshness_status: assessment.freshnessStatus,
      extracted_text: extracted.text,
      content_fingerprint: extracted.fingerprint,
      failure_reason: extracted.warnings.length ? extracted.warnings.join("; ") : null,
    });
  } catch (error) {
    await repository.updateUserSource(String(pending?.id), {
      status: "fetch_failed",
      failure_reason: error instanceof Error ? error.message : String(error),
      retrieved_at: new Date().toISOString(),
    });
    throw error;
  }
}

export async function decideSource(
  repository: SupabaseRepository,
  sourceId: string,
  decision: "approve" | "reject",
  approvedClaims: string[] = [],
) {
  return repository.updateUserSource(sourceId, {
    status: decision === "approve" ? "approved" : "rejected",
    approved_claims: approvedClaims,
  });
}

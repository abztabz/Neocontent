import { SupabaseRepository } from "../db/supabase.js";
import { fetchSource } from "../research/fetch-source.js";
import { extractSource } from "../research/extract-source.js";
import { scoreSource } from "../research/score-source.js";
import { assertAllowedSourceUrl } from "../research/source-governance.js";

export interface AddSourceRequest {
  siteId: string;
  url: string;
  label?: string;
  purpose: "business_knowledge" | "industry_research" | "preferred_research" | "topic_discovery_only";
}

export async function addSource(repository: SupabaseRepository, input: AddSourceRequest) {
  const safeUrl = await assertAllowedSourceUrl(input.url);
  const pending = await repository.insertUserSource({
    site_id: input.siteId,
    url: safeUrl.toString(),
    label: input.label ?? null,
    source_purpose: input.purpose,
    status: "pending_fetch",
  });

  try {
    const fetched = await fetchSource(safeUrl);
    const extracted = extractSource(fetched);
    const assessment = scoreSource({
      url: safeUrl,
      title: extracted.title,
      publisher: extracted.publisher,
      publishedAt: extracted.publishedAt,
      text: extracted.text,
    });

    return repository.updateUserSource(String(pending?.id), {
      status: "pending_review",
      canonical_url: fetched.finalUrl,
      publisher: extracted.publisher,
      published_at: extracted.publishedAt,
      retrieved_at: new Date().toISOString(),
      trust_score: assessment.trustScore,
      freshness_status: assessment.freshness,
      extracted_text: extracted.text,
      risk_flags: assessment.riskFlags,
    });
  } catch (error) {
    await repository.updateUserSource(String(pending?.id), {
      status: "fetch_failed",
      fetch_error: error instanceof Error ? error.message : String(error),
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
    reviewed_at: new Date().toISOString(),
  });
}

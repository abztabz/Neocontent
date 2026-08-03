import { randomUUID } from "node:crypto";
import { SupabaseRepository } from "../db/supabase.js";
import { generateOpportunities, selectOpportunity } from "../opportunities/opportunity-engine.js";
import { buildEvidencePackage, type FreshnessStatus, type SourceEvidence } from "../research/research-pipeline.js";
import { researchIndustry } from "../research/live-research.js";
import { assertPublishable, verifyClaims, type EvidenceSource, type MaterialClaim } from "../research/claim-verifier.js";
import { writeArticle } from "../writing/article-writer.js";
import { publishToWordPress } from "../publishing/wordpress-publisher.js";

function nextRun(cadence: unknown): string {
  const date = new Date();
  if (cadence === "daily") date.setUTCDate(date.getUTCDate() + 1);
  else if (cadence === "biweekly") date.setUTCDate(date.getUTCDate() + 14);
  else if (cadence === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString();
}

function freshness(value: unknown): FreshnessStatus {
  return value === "current" || value === "aging" || value === "stale" ? value : "unknown";
}

function meaningfulTerms(text: string): string[] {
  const stop = new Set(["that", "this", "with", "from", "have", "will", "their", "about", "into", "than", "when", "where", "which", "your", "they", "them", "were", "been", "being", "also"]);
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].filter((term) => !stop.has(term));
}

function businessClaimSupported(claim: string, knowledgeText: string): boolean {
  const terms = meaningfulTerms(claim);
  if (!terms.length) return false;
  const matched = terms.filter((term) => knowledgeText.toLowerCase().includes(term)).length;
  return matched / terms.length >= 0.45;
}

export async function runSite(
  repository: SupabaseRepository,
  site: Record<string, unknown>,
  trigger: "manual" | "scheduled",
  idempotencyKey: string = randomUUID(),
) {
  const run = await repository.insertRun({
    organization_id: site.organization_id,
    site_id: site.id,
    trigger_type: trigger,
    status: "started",
    idempotency_key: idempotencyKey,
  });
  if (!run?.id) throw new Error("Unable to create content run");

  try {
    const [knowledge, pendingKnowledge, sources, recentArticles] = await Promise.all([
      repository.listApprovedKnowledge(String(site.id)),
      repository.listPendingKnowledgeCandidates(String(site.id)),
      repository.listApprovedSources(String(site.id)),
      repository.listRecentArticles(String(site.id)),
    ]);

    if (site.knowledge_review_required !== false && pendingKnowledge.length > 0) {
      throw new Error("Content run blocked because website knowledge changes require approval");
    }

    const customerEvidence: SourceEvidence[] = sources.map((source) => ({
      id: String(source.id),
      url: String(source.url),
      title: String(source.label || source.url),
      publisher: String(source.publisher || new URL(String(source.url)).hostname),
      trustScore: Number(source.trust_score || 0),
      freshness: freshness(source.freshness_status),
      sourceType: String(source.purpose || "customer_source"),
      excerpts: Array.isArray(source.approved_claims) ? source.approved_claims.map(String) : [],
    }));

    const existingTitles = recentArticles.map((item) => String(item.title));
    const opportunities = generateOpportunities({
      businessName: String(site.business_name || "the business"),
      industry: String(site.industry || "the industry"),
      audience: String(site.target_audience || "customers"),
      services: Array.isArray(site.services) ? site.services.map(String) : [],
      contentMode: String(site.content_mode || "balanced"),
      evidenceCount: customerEvidence.length,
      existingTitles,
    });
    const opportunity = selectOpportunity(opportunities);

    const shouldResearch = opportunity.stream === "industry" || site.content_mode === "industry_authority";
    const liveEvidence = shouldResearch
      ? await researchIndustry({
          industry: String(site.industry || "the business industry"),
          audience: String(site.target_audience || "the business audience"),
          topicHint: opportunity.title,
        })
      : [];

    const evidence = buildEvidencePackage([...customerEvidence, ...liveEvidence]);
    if ((opportunity.stream === "industry" || site.content_mode === "industry_authority") && !evidence.publishable) {
      throw new Error(evidence.reasons.join(" ") || "Industry content requires verified evidence");
    }

    const article = await writeArticle({
      site,
      opportunity: opportunity as unknown as Record<string, unknown>,
      approvedKnowledge: knowledge,
      evidence: evidence.sources,
      existingTitles,
    });

    if (article.businessAlignmentScore < 80) throw new Error("Business alignment score is below the V1 threshold");
    if (article.verificationScore < 70) throw new Error("Model verification score is below the V1 threshold");
    if ((opportunity.stream === "industry" || site.content_mode === "industry_authority") && article.sources.length === 0) {
      throw new Error("Industry authority articles require visible source records");
    }

    const evidenceById = new Map(evidence.sources.map((source) => [source.id, source]));
    const externalClaims: MaterialClaim[] = article.materialClaims
      .filter((claim) => claim.category !== "business")
      .map((claim) => ({ ...claim }));
    const evidenceSources: EvidenceSource[] = evidence.sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      trustScore: source.trustScore,
      freshness: source.freshness,
      text: source.excerpts.join(" "),
    }));
    const verifications = verifyClaims(externalClaims, evidenceSources);
    assertPublishable(verifications);

    const knowledgeText = [
      String(site.business_name || ""), String(site.business_description || ""),
      JSON.stringify(site.services || []), JSON.stringify(site.locations || []),
      ...knowledge.map((item) => `${String(item.title || "")} ${String(item.content || "")}`),
    ].join(" ");
    const unsupportedBusinessClaims = article.materialClaims.filter(
      (claim) => claim.category === "business" && !businessClaimSupported(claim.text, knowledgeText),
    );
    if (unsupportedBusinessClaims.length > 0) {
      throw new Error(`Publication blocked: ${unsupportedBusinessClaims.length} business claim(s) are absent from approved knowledge`);
    }

    for (const source of article.sources) {
      if (!evidenceById.has(source.id)) throw new Error(`Publication blocked: article referenced an unapproved source (${source.id})`);
    }

    const deterministicScore = Math.round(
      (verifications.reduce((sum, item) => sum + item.confidence, 0) / Math.max(verifications.length, 1)) * 0.7
      + article.businessAlignmentScore * 0.3,
    );
    if (deterministicScore < 70) throw new Error("Deterministic verification score is below the V1 threshold");

    const record = await repository.insertArticle({
      organization_id: site.organization_id,
      site_id: site.id,
      title: article.title,
      excerpt: article.excerpt,
      body_html: article.body,
      rationale: article.rationale,
      authority_score: article.authorityScore,
      business_alignment_score: article.businessAlignmentScore,
      verification_score: deterministicScore,
      source_manifest: article.sources,
      claim_map: article.materialClaims,
      status: "generated",
      idempotency_key: idempotencyKey,
    });
    if (!record?.id) throw new Error("Unable to persist generated article");

    const wordpress = await publishToWordPress({ site, article: { ...article, verificationScore: deterministicScore }, idempotencyKey });
    await repository.updateArticle(String(record.id), {
      status: wordpress.status === "publish" ? "published" : "awaiting_approval",
      external_id: wordpress.externalId ?? null,
      external_url: wordpress.url ?? null,
      published_at: wordpress.publishedAt ?? null,
    });
    await repository.updateRun(String(run.id), {
      status: "completed",
      reason: `Delivered to WordPress as ${String(wordpress.status ?? "unknown")}`,
      article_id: record.id,
      completed_at: new Date().toISOString(),
    });
    await repository.updateSite(String(site.id), { next_run_at: nextRun(site.cadence) });

    return { status: "completed", runId: run.id, articleId: record.id, opportunity, wordpress };
  } catch (error) {
    await repository.updateRun(String(run.id), {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
      completed_at: new Date().toISOString(),
    });
    throw error;
  }
}

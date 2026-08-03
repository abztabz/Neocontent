import { randomUUID } from "node:crypto";
import { SupabaseRepository } from "../db/supabase.js";
import { buildEvidencePackage } from "../research/research-pipeline.js";
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

export async function runSite(
  repository: SupabaseRepository,
  site: Record<string, unknown>,
  trigger: "manual" | "scheduled",
  idempotencyKey = randomUUID(),
) {
  const run = await repository.insertRun({
    organization_id: site.organization_id,
    site_id: site.id,
    trigger_type: trigger,
    status: "started",
    idempotency_key: idempotencyKey,
  });

  try {
    const [knowledge, sources, recentArticles] = await Promise.all([
      repository.listApprovedKnowledge(String(site.id)),
      repository.listApprovedSources(String(site.id)),
      repository.listRecentArticles(String(site.id)),
    ]);

    const evidence = buildEvidencePackage(sources.map((source) => ({
      id: String(source.id),
      url: String(source.url),
      title: String(source.label || source.url),
      publisher: String(source.publisher || new URL(String(source.url)).hostname),
      trustScore: Number(source.trust_score || 0),
      freshness: String(source.freshness_status || "unknown"),
      excerpts: Array.isArray(source.approved_claims) ? source.approved_claims.map(String) : [],
    })));

    if (String(site.content_mode) === "industry_authority" && !evidence.publishable) {
      throw new Error(evidence.reasons.join(" ") || "Industry authority mode requires approved evidence");
    }

    const article = await writeArticle({
      site,
      approvedKnowledge: knowledge,
      evidence: evidence.sources,
      existingTitles: recentArticles.map((item) => String(item.title)),
    });

    if (article.businessAlignmentScore < 80) throw new Error("Business alignment score is below the V1 threshold");
    if (article.verificationScore < 70) throw new Error("Verification score is below the V1 threshold");

    const record = await repository.insertArticle({
      organization_id: site.organization_id,
      site_id: site.id,
      title: article.title,
      excerpt: article.excerpt,
      body_html: article.body,
      rationale: article.rationale,
      authority_score: article.authorityScore,
      business_alignment_score: article.businessAlignmentScore,
      verification_score: article.verificationScore,
      source_manifest: article.sources,
      claim_map: article.materialClaims,
      status: "generated",
      idempotency_key: idempotencyKey,
    });

    const wordpress = await publishToWordPress({ site, article, idempotencyKey });
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

    return { status: "completed", runId: run.id, articleId: record.id, wordpress };
  } catch (error) {
    await repository.updateRun(String(run.id), {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
      completed_at: new Date().toISOString(),
    });
    throw error;
  }
}

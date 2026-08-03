import { createRepository } from "../../runtime.js";
import { authenticateSiteRequest, type SignedRequestLike } from "../authenticate.js";

export interface KnowledgeCandidateInput {
  externalId?: string;
  title: string;
  summary: string;
  sourceUrl?: string;
  sourceType?: string;
  confidence?: number;
  riskLevel?: "low" | "normal" | "high";
  fingerprint: string;
}

export async function handleKnowledgeCandidates(
  request: SignedRequestLike,
  candidates: KnowledgeCandidateInput[],
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request);
  const synced: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    const row = await repository.insertKnowledgeCandidate({
      organization_id: site.organization_id,
      site_id: site.id,
      external_id: candidate.externalId ?? null,
      title: candidate.title,
      summary: candidate.summary,
      source_url: candidate.sourceUrl ?? null,
      source_type: candidate.sourceType ?? "website",
      status: "pending",
      risk_level: candidate.riskLevel ?? "normal",
      confidence: Math.max(0, Math.min(100, candidate.confidence ?? 0)),
      fingerprint: candidate.fingerprint,
    });
    if (row) synced.push(row);
  }
  return {
    status: 200,
    body: {
      inserted: synced.length,
      candidates: synced.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        fingerprint: row.fingerprint,
        status: row.status,
      })),
    },
  };
}

export async function handleKnowledgeDecision(
  request: SignedRequestLike,
  candidateId: string,
  decision: "approve" | "reject",
  editedContent?: string,
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request);
  const pending = await repository.listPendingKnowledgeCandidates(String(site.id));
  const candidate = pending.find((item) => String(item.id) === candidateId);
  if (!candidate) throw new Error("Knowledge candidate was not found or is no longer pending");

  if (decision === "approve") {
    await repository.upsertKnowledgeItem({
      organization_id: site.organization_id,
      site_id: site.id,
      external_id: candidate.external_id ?? null,
      title: candidate.title,
      content: editedContent?.trim() || candidate.summary,
      source_url: candidate.source_url ?? null,
      source_type: candidate.source_type ?? "website",
      status: "approved",
      confidence: candidate.confidence ?? 0,
      fingerprint: candidate.fingerprint,
    });
  }
  const updated = await repository.updateKnowledgeCandidate(candidateId, {
    status: decision === "approve" ? "approved" : "rejected",
    reviewed_at: new Date().toISOString(),
  });
  return { status: 200, body: updated ?? {} };
}

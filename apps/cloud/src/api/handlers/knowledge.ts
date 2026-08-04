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

function validateCandidate(candidate: KnowledgeCandidateInput): KnowledgeCandidateInput {
  if (!candidate || typeof candidate !== "object") throw new Error("Knowledge candidate is invalid");
  if (typeof candidate.title !== "string" || !candidate.title.trim() || candidate.title.length > 300) {
    throw new Error("Knowledge candidate title is invalid");
  }
  if (typeof candidate.summary !== "string" || !candidate.summary.trim() || candidate.summary.length > 10_000) {
    throw new Error("Knowledge candidate summary is invalid");
  }
  if (typeof candidate.fingerprint !== "string" || !/^[a-f0-9]{32,128}$/i.test(candidate.fingerprint)) {
    throw new Error("Knowledge candidate fingerprint is invalid");
  }
  if (candidate.sourceUrl && (typeof candidate.sourceUrl !== "string" || candidate.sourceUrl.length > 2_048)) {
    throw new Error("Knowledge candidate source URL is invalid");
  }
  return candidate;
}

export async function handleKnowledgeCandidates(
  request: SignedRequestLike,
  expectedExternalSiteId: string,
  candidates: KnowledgeCandidateInput[],
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request, expectedExternalSiteId);
  const synced: Record<string, unknown>[] = [];
  for (const rawCandidate of candidates) {
    const candidate = validateCandidate(rawCandidate);
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
  expectedExternalSiteId: string,
  candidateId: string,
  decision: "approve" | "reject",
  editedContent?: string,
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request, expectedExternalSiteId);
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) throw new Error("Knowledge candidate identifier is invalid");
  if (decision !== "approve" && decision !== "reject") throw new Error("Knowledge decision is invalid");
  if (editedContent !== undefined && (typeof editedContent !== "string" || editedContent.length > 10_000)) {
    throw new Error("Edited knowledge is invalid");
  }
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
  const updated = await repository.updateKnowledgeCandidate(candidateId, String(site.id), {
    status: decision === "approve" ? "approved" : "rejected",
    reviewed_at: new Date().toISOString(),
  });
  return { status: 200, body: updated ?? {} };
}

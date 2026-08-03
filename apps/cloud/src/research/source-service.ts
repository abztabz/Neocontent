import { randomUUID } from "node:crypto";
import { extractEvidence } from "./extractor.js";
import { fetchSource } from "./source-fetcher.js";
import { governSource } from "./source-governance.js";

export interface IngestedSource {
  id: string;
  requestedUrl: string;
  finalUrl: string;
  title: string;
  publisher?: string;
  publishedAt?: string;
  description?: string;
  retrievedAt: string;
  sourceType: string;
  trustScore: number;
  freshness: "current" | "aging" | "stale" | "unknown";
  approvedForClaims: boolean;
  rejectionReasons: string[];
  text: string;
}

export async function ingestSource(url: string): Promise<IngestedSource> {
  const retrieved = await fetchSource(url);
  const evidence = extractEvidence(retrieved.body, retrieved.finalUrl);
  const governance = governSource(retrieved.finalUrl, evidence);
  return {
    id: randomUUID(),
    requestedUrl: retrieved.requestedUrl,
    finalUrl: retrieved.finalUrl,
    title: evidence.title,
    publisher: evidence.publisher,
    publishedAt: evidence.publishedAt,
    description: evidence.description,
    retrievedAt: retrieved.retrievedAt,
    sourceType: governance.sourceType,
    trustScore: governance.trustScore,
    freshness: governance.freshness,
    approvedForClaims: governance.approvedForClaims,
    rejectionReasons: governance.rejectionReasons,
    text: evidence.text,
  };
}

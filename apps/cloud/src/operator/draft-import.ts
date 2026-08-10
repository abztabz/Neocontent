import type { GeneratedArticle } from "../writing/article-writer.js";

export interface ParsedDraftImport {
  article: GeneratedArticle;
  payload: Record<string, unknown>;
}

function jsonCandidate(raw: string): string {
  if (raw.length < 2 || raw.length > 750_000) throw new Error("Draft JSON size is invalid");
  let value = raw.replace(/^\uFEFF/, "").trim();
  const fence = value.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) value = fence[1].trim();

  if (!value.startsWith("{") || !value.endsWith("}")) {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start && start + value.length - end - 1 <= 2_000) {
      value = value.slice(start, end + 1).trim();
    }
  }
  return value;
}

function nextNonWhitespace(value: string, start: number): number {
  let index = start;
  while (index < value.length && /\s/.test(value[index])) index += 1;
  return index;
}

function smartQuoteClosesString(value: string, index: number): boolean {
  const next = nextNonWhitespace(value, index + 1);
  if (next >= value.length || [":", "}", "]"].includes(value[next])) return true;
  if (value[next] !== ",") return false;
  const following = nextNonWhitespace(value, next + 1);
  if (following >= value.length) return true;
  return /["“”{[\]tfn\d-]/.test(value[following]);
}

function normalizeStructuralSmartQuotes(value: string): string {
  let normalized = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (!inString && (character === "“" || character === "”")) {
      normalized += '"';
      inString = true;
      escaped = false;
      continue;
    }
    if (inString && (character === "“" || character === "”") && smartQuoteClosesString(value, index)) {
      normalized += '"';
      inString = false;
      escaped = false;
      continue;
    }
    normalized += character;
    if (!inString) continue;
    if (character === "\\" && !escaped) escaped = true;
    else escaped = false;
  }
  return normalized;
}

export function parseDraftImport(raw: string): ParsedDraftImport {
  let payload: Record<string, unknown>;
  try {
    const candidate = jsonCandidate(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate) as unknown;
    } catch {
      parsed = JSON.parse(normalizeStructuralSmartQuotes(candidate)) as unknown;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not-an-object");
    payload = parsed as Record<string, unknown>;
  } catch {
    throw new Error("Draft is not valid JSON. Copy Luna's complete JSON response and paste it again.");
  }

  if (payload.schemaVersion !== "neo-blog-draft-v1") throw new Error("Draft schema is invalid");
  const title = String(payload.title ?? "").trim();
  const body = String(payload.bodyHtml ?? "").trim();
  if (!title || title.length > 1000 || !body || body.length > 500_000) throw new Error("Draft content is invalid");
  const sources = Array.isArray(payload.sources) ? payload.sources.slice(0, 50).flatMap((source, index) => {
    if (!source || typeof source !== "object") return [];
    const item = source as Record<string, unknown>;
    const url = String(item.url ?? "");
    try { if (new URL(url).protocol !== "https:") return []; } catch { return []; }
    return [{
      id: `manual-${index + 1}`,
      title: String(item.title ?? "").slice(0, 500),
      publisher: String(item.publisher ?? "").slice(0, 300),
      url,
      claimSupported: String(item.claimSupported ?? "").slice(0, 2000),
      sourceType: "operator_verified",
    }];
  }) : [];

  return {
    payload,
    article: {
      title,
      excerpt: String(payload.excerpt ?? "").slice(0, 8000),
      body,
      rationale: String(payload.rationale ?? "").slice(0, 20000),
      authorityScore: 0,
      businessAlignmentScore: 0,
      verificationScore: 0,
      sources,
      materialClaims: [],
      seoTitle: String(payload.seoTitle ?? "").slice(0, 1000),
      metaDescription: String(payload.metaDescription ?? "").slice(0, 2000),
      focusKeyphrase: String(payload.focusKeyphrase ?? "").slice(0, 500),
    },
  };
}

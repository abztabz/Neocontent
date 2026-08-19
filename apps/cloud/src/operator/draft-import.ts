import type { GeneratedArticle } from "../writing/article-writer.js";

export interface ParsedDraftImport {
  article: GeneratedArticle;
  payload: Record<string, unknown>;
}

function jsonCandidate(raw: string): string {
  if (raw.length < 2 || raw.length > 750_000) throw new Error("Draft JSON size is invalid");
  let value = raw.replace(/^\uFEFF/, "").trim();
  const fence = value.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (fence) value = fence[1].trim();

  // A clipboard or transport layer may serialize the complete object once.
  // Keep that envelope intact so parseJsonObject can safely unwrap it.
  if (value.startsWith('"') && value.endsWith('"')) return value;

  const start = value.indexOf("{");
  if (start < 0) return value;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return value.slice(start, index + 1).trim();
  }

  // Smart-quoted JSON cannot be balanced safely until its structural quotes are
  // normalized. Preserve the complete object-looking span for that second pass.
  const end = value.lastIndexOf("}");
  return end > start ? value.slice(start, end + 1).trim() : value;
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
  // A comma followed by a word is ordinary prose (for example “impact test,”
  // then verify it). A comma followed by a quote/container is JSON structure.
  return /["“”{}[\]]/.test(value[following]);
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
    if (inString && (character === "\n" || character === "\r" || character === "\t")) {
      if (character === "\n") normalized += "\\n";
      else if (character === "\t") normalized += "\\t";
      else if (value[index + 1] !== "\n") normalized += "\\n";
    } else if (!inString && /[\u200B\u2060\uFEFF]/.test(character)) {
      // iOS and rich-text clipboards may add invisible separators outside data.
    } else {
      normalized += character;
    }
    if (!inString) continue;
    if (character === "\\" && !escaped) escaped = true;
    else escaped = false;
  }
  return normalized;
}

function parseJsonObject(candidate: string): Record<string, unknown> {
  const attempts = [candidate, normalizeStructuralSmartQuotes(candidate)];
  for (const attempt of attempts) {
    try {
      let parsed = JSON.parse(attempt) as unknown;
      // Accept JSON copied as a serialized string, but unwrap only once and
      // still require the governed object below.
      if (typeof parsed === "string" && parsed.length <= 750_000) {
        try { parsed = JSON.parse(parsed) as unknown; } catch { /* try next form */ }
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // The next bounded normalization is intentionally attempted.
    }
  }
  throw new Error("not-valid-json-object");
}

function limited(value: unknown, maximum: number): string {
  return String(value ?? "").trim().slice(0, maximum);
}

function normalizeBodyHtml(value: string): string {
  const body = value.replace(/<\/?h1(?:\s[^>]*)?>/gi, (tag) => tag.startsWith("</") ? "</h2>" : "<h2>");
  if (body.length > 500) {
    const paragraphs = body.match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi) ?? [];
    const sections = body.match(/<h2(?:\s[^>]*)?>[\s\S]*?<\/h2>/gi) ?? [];
    if (paragraphs.length < 4 || sections.length < 2) {
      throw new Error("Draft formatting needs at least four paragraphs and two H2 sections. Ask Luna for semantic WordPress HTML, then import the complete JSON again.");
    }
  }
  return body;
}

function imagePlan(value: unknown, title: string, body: string) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const featuredSource = source.featured && typeof source.featured === "object" && !Array.isArray(source.featured)
    ? source.featured as Record<string, unknown> : {};
  const headings = [...body.matchAll(/<h2(?:\s[^>]*)?>([\s\S]*?)<\/h2>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean).slice(0, 2);
  const inlineSource = Array.isArray(source.inline) ? source.inline : [];
  const inline = inlineSource.slice(0, 3).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const image = item as Record<string, unknown>;
    const subject = limited(image.subject, 500);
    if (!subject) return [];
    return [{
      afterHeading: limited(image.afterHeading, 300), subject,
      altText: limited(image.altText, 300), caption: limited(image.caption, 500),
    }];
  });
  if (!inline.length) {
    inline.push(...headings.map((heading) => ({
      afterHeading: heading,
      subject: `Editorial supporting image for ${heading}`,
      altText: heading,
      caption: "",
    })));
  }
  return {
    featured: {
      subject: limited(featuredSource.subject, 500) || `Editorial banner image for ${title}`,
      altText: limited(featuredSource.altText, 300) || title,
      caption: limited(featuredSource.caption, 500),
    },
    inline,
  };
}

export function parseDraftImport(raw: string): ParsedDraftImport {
  let payload: Record<string, unknown>;
  try {
    const candidate = jsonCandidate(raw);
    payload = parseJsonObject(candidate);
  } catch {
    throw new Error("Draft is not valid JSON. Copy Luna's complete JSON response and paste it again.");
  }

  if (payload.schemaVersion !== "neo-blog-draft-v1") throw new Error("Draft schema is invalid");
  const title = String(payload.title ?? "").trim();
  const body = normalizeBodyHtml(String(payload.bodyHtml ?? "").trim());
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

  const plannedImages = imagePlan(payload.imagePlan, title, body);
  payload.bodyHtml = body;
  payload.imagePlan = plannedImages;
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
      imagePlan: plannedImages,
    },
  };
}

import { fetchSource } from "./fetch-source.js";
import { extractSource } from "./extract-source.js";
import { scoreSource } from "./score-source.js";

export interface LiveResearchSource {
  id: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt?: string;
  retrievedAt: string;
  trustScore: number;
  freshness: "current" | "aging" | "stale" | "unknown";
  sourceType: string;
  excerpts: string[];
}

function responseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const value = part as { type?: string; text?: string };
      return value.type === "output_text" && value.text ? [value.text] : [];
    });
  }).join("\n");
}

async function discoverUrls(input: { industry: string; audience: string; topicHint?: string }): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_RESEARCH_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5-mini",
      store: false,
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      input: `Find current, authoritative sources for an evidence-backed article in the ${input.industry} industry for ${input.audience}. ${input.topicHint ? `Topic direction: ${input.topicHint}.` : ""} Prefer government, regulators, universities, peer-reviewed research, standards bodies, and recognized professional associations. Avoid content farms, anonymous blogs, affiliate pages, and AI-generated summaries. Return only a JSON object with a urls array containing 4 to 8 direct source URLs.`,
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`OpenAI web research ${response.status}: ${JSON.stringify(payload)}`);
  const parsed = JSON.parse(responseText(payload)) as { urls?: unknown[] };
  return (parsed.urls ?? []).filter((url): url is string => typeof url === "string").slice(0, 8);
}

function evidenceExcerpts(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 80 && sentence.length <= 500)
    .slice(0, 12);
}

export async function researchIndustry(input: {
  industry: string;
  audience: string;
  topicHint?: string;
}): Promise<LiveResearchSource[]> {
  const urls = await discoverUrls(input);
  const accepted: LiveResearchSource[] = [];

  for (const url of urls) {
    try {
      const fetched = await fetchSource(url, AbortSignal.timeout(20_000));
      const extracted = extractSource(fetched);
      const assessment = scoreSource(extracted);
      if (!assessment.approvedForClaims || assessment.trustScore < 70) continue;
      accepted.push({
        id: `live:${extracted.fingerprint}`,
        url: extracted.canonicalUrl,
        title: extracted.title,
        publisher: extracted.publisher ?? new URL(extracted.canonicalUrl).hostname,
        publishedAt: extracted.publishedAt,
        retrievedAt: fetched.retrievedAt,
        trustScore: assessment.trustScore,
        freshness: assessment.freshnessStatus,
        sourceType: assessment.sourceType,
        excerpts: evidenceExcerpts(extracted.text),
      });
    } catch {
      // Individual sources are non-fatal; the run is blocked later if evidence is insufficient.
    }
  }

  return accepted;
}

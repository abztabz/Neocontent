export type ClaimCategory = "business" | "industry" | "timely" | "general_guidance";

export interface ArticleSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt?: string;
  retrievedAt?: string;
  claimSupported: string;
  sourceType: string;
}

export interface ArticleClaim {
  id: string;
  text: string;
  category: ClaimCategory;
  sourceIds: string[];
}

export interface GeneratedArticle {
  title: string;
  excerpt: string;
  body: string;
  rationale: string;
  authorityScore: number;
  businessAlignmentScore: number;
  verificationScore: number;
  sources: ArticleSource[];
  materialClaims: ArticleClaim[];
}

function outputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const candidate = part as { type?: string; text?: string };
      return candidate.type === "output_text" && candidate.text ? [candidate.text] : [];
    });
  }).join("\n");
}

export async function writeArticle(input: {
  site: Record<string, unknown>;
  opportunity: Record<string, unknown>;
  approvedKnowledge: Record<string, unknown>[];
  evidence: unknown[];
  existingTitles: string[];
}): Promise<GeneratedArticle> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const prompt = `Create one evidence-backed WordPress blog for this business.\n\nSELECTED CONTENT OPPORTUNITY\n${JSON.stringify(input.opportunity)}\n\nBUSINESS\n${JSON.stringify(input.site)}\n\nAPPROVED BUSINESS KNOWLEDGE\n${JSON.stringify(input.approvedKnowledge)}\n\nAPPROVED EXTERNAL EVIDENCE\n${JSON.stringify(input.evidence)}\n\nEXISTING TITLES\n${JSON.stringify(input.existingTitles)}\n\nRules:\n- Follow the selected content opportunity and preserve its audience intent.\n- Never claim the business offers anything not present in approved business knowledge or the business profile.\n- Every material external fact must be supported by the supplied evidence.\n- Use the exact evidence source id when linking a claim to evidence.\n- Business claims must be supported by approved business knowledge, not by unrelated external evidence.\n- Timely claims require a current source.\n- General guidance may have an empty sourceIds array only when it makes no material external factual claim.\n- Do not invent sources, dates, statistics, laws, studies, or quotations.\n- Avoid duplicating existing titles.\n- Return clean WordPress HTML between 900 and 1400 words.\n- Return JSON only.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      store: false,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "neo_authority_article",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              excerpt: { type: "string" },
              body: { type: "string" },
              rationale: { type: "string" },
              authorityScore: { type: "integer", minimum: 0, maximum: 100 },
              businessAlignmentScore: { type: "integer", minimum: 0, maximum: 100 },
              verificationScore: { type: "integer", minimum: 0, maximum: 100 },
              materialClaims: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    text: { type: "string" },
                    category: { type: "string", enum: ["business", "industry", "timely", "general_guidance"] },
                    sourceIds: { type: "array", items: { type: "string" } }
                  },
                  required: ["id", "text", "category", "sourceIds"]
                }
              },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" }, title: { type: "string" }, publisher: { type: "string" },
                    url: { type: "string" }, publishedAt: { type: "string" }, retrievedAt: { type: "string" },
                    claimSupported: { type: "string" }, sourceType: { type: "string" }
                  },
                  required: ["id", "title", "publisher", "url", "publishedAt", "retrievedAt", "claimSupported", "sourceType"]
                }
              }
            },
            required: ["title", "excerpt", "body", "rationale", "authorityScore", "businessAlignmentScore", "verificationScore", "materialClaims", "sources"]
          }
        }
      }
    })
  });

  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(payload)}`);
  return JSON.parse(outputText(payload)) as GeneratedArticle;
}

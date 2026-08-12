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
  seoTitle?: string;
  metaDescription?: string;
  focusKeyphrase?: string;
  imagePlan?: {
    featured: { subject: string; altText: string; caption: string };
    inline: Array<{ afterHeading: string; subject: string; altText: string; caption: string }>;
  };
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

  input = {
    ...input,
    site: {
      business_name: String(input.site.business_name ?? ""),
      business_description: String(input.site.business_description ?? ""),
      industry: String(input.site.industry ?? ""),
      target_audience: String(input.site.target_audience ?? ""),
      tone: String(input.site.tone ?? ""),
      services: Array.isArray(input.site.services) ? input.site.services.map(String).slice(0, 50) : [],
      locations: Array.isArray(input.site.locations) ? input.site.locations.map(String).slice(0, 50) : [],
      content_mode: String(input.site.content_mode ?? "balanced"),
    },
    approvedKnowledge: input.approvedKnowledge.map((item) => ({
      title: String(item.title ?? ""),
      content: String(item.content ?? ""),
      source_type: String(item.source_type ?? "website"),
    })),
  };

  const prompt = `Create one evidence-backed WordPress blog for this business.\n\nSELECTED CONTENT OPPORTUNITY\n${JSON.stringify(input.opportunity)}\n\nBUSINESS\n${JSON.stringify(input.site)}\n\nAPPROVED BUSINESS KNOWLEDGE\n${JSON.stringify(input.approvedKnowledge)}\n\nAPPROVED EXTERNAL EVIDENCE\n${JSON.stringify(input.evidence)}\n\nEXISTING TITLES\n${JSON.stringify(input.existingTitles)}\n\nRules:\n- Follow the selected content opportunity and preserve its audience intent.\n- Never claim the business offers anything not present in approved business knowledge or the business profile.\n- Every material external fact must be supported by the supplied evidence.\n- Use the exact evidence source id when linking a claim to evidence.\n- Business claims must be supported by approved business knowledge, not by unrelated external evidence.\n- Timely claims require a current source.\n- General guidance may have an empty sourceIds array only when it makes no material external factual claim.\n- Do not invent sources, dates, statistics, laws, studies, or quotations.\n- Avoid duplicating existing titles.\n- Return clean semantic WordPress HTML between 900 and 1400 words. The title is the only H1, so body must use paragraphs, H2 sections, H3 subsections where useful, and lists or blockquotes when they aid comprehension.\n- Provide a featured image concept and up to three useful inline image concepts. Do not invent image URLs or licensing rights.\n- Return JSON only.`;

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
              imagePlan: {
                type: "object",
                additionalProperties: false,
                properties: {
                  featured: {
                    type: "object", additionalProperties: false,
                    properties: { subject: { type: "string" }, altText: { type: "string" }, caption: { type: "string" } },
                    required: ["subject", "altText", "caption"]
                  },
                  inline: {
                    type: "array", maxItems: 3,
                    items: {
                      type: "object", additionalProperties: false,
                      properties: { afterHeading: { type: "string" }, subject: { type: "string" }, altText: { type: "string" }, caption: { type: "string" } },
                      required: ["afterHeading", "subject", "altText", "caption"]
                    }
                  }
                },
                required: ["featured", "inline"]
              },
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
            required: ["title", "excerpt", "body", "rationale", "authorityScore", "businessAlignmentScore", "verificationScore", "imagePlan", "materialClaims", "sources"]
          }
        }
      }
    })
  });

  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(payload)}`);
  const article = JSON.parse(outputText(payload)) as GeneratedArticle;
  if (!article.title || article.title.length > 1_000) throw new Error("Generated article title is invalid");
  if (!article.body || article.body.length > 500_000) throw new Error("Generated article body is invalid");
  if (article.excerpt.length > 8_000 || article.rationale.length > 20_000) throw new Error("Generated article metadata is invalid");
  if (article.sources.length > 50 || article.materialClaims.length > 100) throw new Error("Generated article contains too many evidence records");
  return article;
}

const INJECTION_PATTERNS = [
  /ignore (all|any|the) previous instructions/i,
  /system prompt/i,
  /developer message/i,
  /you are chatgpt/i,
  /reveal (your|the) (prompt|instructions|secret)/i,
  /execute (this|the following) command/i,
];

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|iframe|form)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function meta(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeEntities(match[1].trim());
    }
  }
  return undefined;
}

export interface ExtractedEvidence {
  title: string;
  publisher?: string;
  publishedAt?: string;
  description?: string;
  text: string;
  injectionSignals: string[];
}

export function extractEvidence(html: string, fallbackUrl: string): ExtractedEvidence {
  const title = meta(html, ["og:title", "twitter:title"])
    ?? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "")
    ?? new URL(fallbackUrl).hostname;
  const text = stripHtml(html).slice(0, 120_000);
  const injectionSignals = INJECTION_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  return {
    title: title || new URL(fallbackUrl).hostname,
    publisher: meta(html, ["og:site_name", "article:publisher", "publisher"]),
    publishedAt: meta(html, ["article:published_time", "date", "datePublished", "parsely-pub-date"]),
    description: meta(html, ["description", "og:description", "twitter:description"]),
    text,
    injectionSignals,
  };
}

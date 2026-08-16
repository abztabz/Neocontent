export interface EditorialDNA {
  schemaVersion: "neo-editorial-dna-v1";
  corpusSize: number;
  core: {
    dominantLanguage: "latin" | "devanagari" | "mixed" | "unknown";
    headlinePatterns: string[];
    preferredFormats: string[];
    medianWords: number;
    listicleRatio: number;
    questionHeadlineRatio: number;
    representativeTitles: string[];
  };
  adaptive: {
    recentTitleTerms: string[];
    recentFormats: string[];
  };
  confidence: number;
}

export interface EditorialConformity {
  score: number;
  passed: boolean;
  reasons: string[];
}

type ContentItem = Record<string, unknown>;

function words(value: unknown): string[] {
  return String(value ?? "").trim().split(/\s+/).filter(Boolean);
}

function scriptCounts(value: string): { latin: number; devanagari: number } {
  return {
    latin: (value.match(/[A-Za-z]/g) ?? []).length,
    devanagari: (value.match(/[\u0900-\u097F]/g) ?? []).length,
  };
}

function detectScript(value: string): "latin" | "devanagari" | "mixed" | "unknown" {
  const counts = scriptCounts(value);
  if (counts.latin === 0 && counts.devanagari === 0) return "unknown";
  if (counts.latin > 0 && counts.devanagari > 0) return "mixed";
  return counts.devanagari > 0 ? "devanagari" : "latin";
}

function corpusScript(value: string): EditorialDNA["core"]["dominantLanguage"] {
  const counts = scriptCounts(value);
  const total = counts.latin + counts.devanagari;
  if (!total) return "unknown";
  const devanagariShare = counts.devanagari / total;
  if (devanagariShare >= 0.65) return "devanagari";
  if (devanagariShare <= 0.35) return "latin";
  return "mixed";
}

function formatOf(title: string): string {
  if (/\b(top|best)\s+\d+|\b\d+\s+(best|top|facts?|reasons?|ways?|songs?|movies?|films?)/i.test(title)) return "listicle";
  if (/\?$/.test(title.trim())) return "question";
  if (/\b(review|reviewed)\b/i.test(title)) return "review";
  if (/\b(facts?|things to know|what to know)\b/i.test(title)) return "facts";
  return "article";
}

function topTerms(titles: string[], limit = 12): string[] {
  const stop = new Set(["this","that","with","from","your","about","into","best","top","the","and","for","are","was","were","has","have","nepal","nepali"]);
  const counts = new Map<string, number>();
  for (const title of titles) {
    for (const term of title.toLowerCase().match(/[a-z\u0900-\u097f][a-z\u0900-\u097f0-9-]{2,}/g) ?? []) {
      if (stop.has(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([term]) => term);
}

export function deriveEditorialDNA(items: ContentItem[]): EditorialDNA {
  const eligible = items.filter((item) => item.voice_eligible === true && ["post","page","custom"].includes(String(item.content_type ?? "")));
  const corpus = eligible.length ? eligible : items.filter((item) => ["post","page","custom"].includes(String(item.content_type ?? "")));
  const titles = corpus.map((item) => String(item.title ?? "").trim()).filter(Boolean);
  const bodies = corpus.map((item) => String(item.content_text ?? ""));
  const dominantLanguage = corpusScript(`${titles.join("\n")}\n${bodies.slice(0, 80).join("\n")}`);
  const formats = titles.map(formatOf);
  const formatCounts = new Map<string, number>();
  formats.forEach((format) => formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1));
  const preferredFormats = [...formatCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 4).map(([format]) => format);
  const wordCounts = bodies.map((body) => words(body).length).filter((count) => count > 0).sort((a,b) => a-b);
  const medianWords = wordCounts.length ? wordCounts[Math.floor(wordCounts.length / 2)] : 0;
  const recent = corpus.slice(0, 30).map((item) => String(item.title ?? "")).filter(Boolean);
  const ratio = (format: string) => titles.length ? formats.filter((value) => value === format).length / titles.length : 0;
  const headlinePatterns = [
    ratio("listicle") >= 0.2 ? "numbered-ranking-or-list" : "",
    ratio("question") >= 0.15 ? "question-led" : "",
    ratio("review") >= 0.1 ? "review-led" : "",
    ratio("facts") >= 0.1 ? "facts-led" : "",
  ].filter(Boolean);
  const confidence = Math.min(100, Math.round((Math.min(corpus.length, 80) / 80) * 80 + (titles.length >= 10 ? 20 : titles.length * 2)));
  return {
    schemaVersion: "neo-editorial-dna-v1",
    corpusSize: corpus.length,
    core: {
      dominantLanguage,
      headlinePatterns,
      preferredFormats,
      medianWords,
      listicleRatio: Number(ratio("listicle").toFixed(2)),
      questionHeadlineRatio: Number(ratio("question").toFixed(2)),
      representativeTitles: titles.slice(0, 12),
    },
    adaptive: {
      recentTitleTerms: topTerms(recent),
      recentFormats: recent.map(formatOf).slice(0, 12),
    },
    confidence,
  };
}

export function evaluateEditorialConformity(article: { title: string; body: string }, dna: EditorialDNA): EditorialConformity {
  if (dna.corpusSize < 5 || dna.confidence < 20) return { score: 100, passed: true, reasons: ["insufficient-corpus-soft-pass"] };
  let score = 100;
  const reasons: string[] = [];
  const articleScript = detectScript(`${article.title}\n${article.body.slice(0, 5000)}`);
  if (dna.core.dominantLanguage !== "unknown" && dna.core.dominantLanguage !== "mixed" && articleScript !== dna.core.dominantLanguage && articleScript !== "mixed") {
    score -= 35;
    reasons.push("dominant-language-mismatch");
  }
  const format = formatOf(article.title);
  if (dna.core.preferredFormats.length && !dna.core.preferredFormats.includes(format)) {
    score -= 20;
    reasons.push("unfamiliar-article-format");
  }
  if (dna.core.listicleRatio >= 0.35 && format !== "listicle") {
    score -= 15;
    reasons.push("house-listicle-pattern-missed");
  }
  const articleWords = words(article.body.replace(/<[^>]+>/g, " ")).length;
  if (dna.core.medianWords >= 300 && articleWords > dna.core.medianWords * 2.1) {
    score -= 15;
    reasons.push("article-much-longer-than-house-style");
  }
  if (dna.core.medianWords >= 500 && articleWords < dna.core.medianWords * 0.45) {
    score -= 15;
    reasons.push("article-much-shorter-than-house-style");
  }
  return { score: Math.max(0, score), passed: score >= 70, reasons };
}

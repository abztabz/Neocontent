import { createHash } from "node:crypto";
import type { FetchedSource } from "./fetch-source.js";

export interface ExtractedSource {
  title: string;
  publisher?: string;
  publishedAt?: string;
  canonicalUrl: string;
  text: string;
  fingerprint: string;
  warnings: string[];
}

const MAX_EXTRACTED_CHARS = 120_000;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function readMeta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtmlEntities(match[1].trim());
    }
  }
  return undefined;
}

function extractTitle(html: string, fallbackUrl: string): string {
  const metadata = readMeta(html, ["og:title", "twitter:title"]);
  if (metadata) return metadata;
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1]?.replace(/\s+/g, " ").trim() || new URL(fallbackUrl).hostname);
}

function extractCanonical(html: string, fallbackUrl: string): string {
  const match = html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  if (!match?.[1]) return fallbackUrl;
  try {
    return new URL(match[1], fallbackUrl).toString();
  } catch {
    return fallbackUrl;
  }
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|canvas|form|nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/li>|<\/h[1-6]>|<\/section>|<\/article>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  ).slice(0, MAX_EXTRACTED_CHARS);
}

export function detectPromptInjection(text: string): string[] {
  const warnings: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/ignore (all|any|the) previous instructions/i, "possible prompt-injection instruction"],
    [/system prompt/i, "references a system prompt"],
    [/reveal (your|the) (secret|instructions|prompt)/i, "requests disclosure of hidden instructions"],
    [/act as (an?|the)/i, "contains role-assignment language"],
  ];
  for (const [pattern, warning] of patterns) {
    if (pattern.test(text)) warnings.push(warning);
  }
  return warnings;
}

export function extractSource(source: FetchedSource): ExtractedSource {
  if (source.contentType === "application/pdf") {
    throw new Error("PDF extraction requires the dedicated PDF extractor");
  }

  const raw = new TextDecoder("utf-8", { fatal: false }).decode(source.body);
  const isHtml = source.contentType.includes("html");
  const text = isHtml ? stripHtml(raw) : raw.replace(/\s+/g, " ").trim().slice(0, MAX_EXTRACTED_CHARS);
  if (text.length < 200) throw new Error("Source did not contain enough extractable text");

  const title = isHtml ? extractTitle(raw, source.finalUrl) : new URL(source.finalUrl).hostname;
  const publisher = isHtml
    ? readMeta(raw, ["og:site_name", "application-name", "author"])
    : undefined;
  const publishedAt = isHtml
    ? readMeta(raw, ["article:published_time", "date", "datePublished", "pubdate"])
    : undefined;
  const canonicalUrl = isHtml ? extractCanonical(raw, source.finalUrl) : source.finalUrl;

  return {
    title,
    publisher,
    publishedAt,
    canonicalUrl,
    text,
    fingerprint: createHash("sha256").update(text).digest("hex"),
    warnings: detectPromptInjection(text),
  };
}

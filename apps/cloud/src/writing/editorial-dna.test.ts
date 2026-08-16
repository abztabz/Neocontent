import assert from "node:assert/strict";
import test from "node:test";
import { deriveEditorialDNA, evaluateEditorialConformity } from "./editorial-dna.js";

function item(title: string, body: string, modifiedAt = "2026-08-01T00:00:00Z") {
  return {
    content_type: "post",
    title,
    content_text: body,
    voice_eligible: true,
    modified_at: modifiedAt,
  };
}

test("derives house patterns from a customer corpus", () => {
  const corpus = [
    item("Top 10 Nepali Songs", "नेपाली संगीतका लोकप्रिय गीतहरूबारे छोटो परिचय। ".repeat(120)),
    item("10 Facts About Nepali Cinema", "नेपाली चलचित्र उद्योगका रोचक तथ्यहरू। ".repeat(120)),
    item("Top 10 Nepali Movies", "नेपाली चलचित्र र दर्शकको रुचिबारे। ".repeat(120)),
    item("Best 10 Pop Songs", "नेपाली पप संगीतको इतिहास र गीतहरू। ".repeat(120)),
    item("10 Things to Know About a Singer", "नेपाली कलाकारका बारेमा जान्नुपर्ने कुराहरू। ".repeat(120)),
    item("Top 10 Movie Performances", "नेपाली कलाकार र अभिनयको चर्चा। ".repeat(120)),
  ];
  const dna = deriveEditorialDNA(corpus);
  assert.equal(dna.schemaVersion, "neo-editorial-dna-v1");
  assert.ok(dna.core.listicleRatio >= 0.5);
  assert.ok(dna.core.preferredFormats.includes("listicle"));
  assert.ok(dna.core.headlinePatterns.includes("numbered-ranking-or-list"));
  assert.ok(dna.corpusSize >= 6);
});

test("blocks a large language and format deviation from established DNA", () => {
  const corpus = Array.from({ length: 12 }, (_, index) => item(
    `Top ${index + 5} Nepali Songs`,
    "नेपाली संगीत र कलाकारका बारेमा स्थानीय शैलीमा लेखिएको सामग्री। ".repeat(100),
  ));
  const dna = deriveEditorialDNA(corpus);
  const result = evaluateEditorialConformity({
    title: "A Strategic Framework for Entertainment Industry Transformation",
    body: "<p>This corporate analysis explores international stakeholder dynamics and strategic optimization.</p>".repeat(80),
  }, dna);
  assert.equal(result.passed, false);
  assert.ok(result.reasons.includes("dominant-language-mismatch"));
  assert.ok(result.reasons.includes("unfamiliar-article-format"));
});

test("soft-passes when there is not enough customer corpus", () => {
  const dna = deriveEditorialDNA([item("One Post", "Small sample")]);
  const result = evaluateEditorialConformity({ title: "Anything", body: "<p>Draft</p>" }, dna);
  assert.equal(result.passed, true);
  assert.ok(result.reasons.includes("insufficient-corpus-soft-pass"));
});

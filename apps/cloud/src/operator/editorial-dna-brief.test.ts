import assert from "node:assert/strict";
import test from "node:test";
import { createLunaBrief } from "./briefing-layer.js";

const websiteContent = Array.from({ length: 10 }, (_, index) => ({
  title: `Top ${index + 5} Nepali Songs`,
  excerpt: "नेपाली संगीत र कलाकारबारे स्थानीय शैलीमा तयार गरिएको सूची। ".repeat(80),
  content: "नेपाली संगीत र कलाकारबारे स्थानीय शैलीमा तयार गरिएको सूची। ".repeat(80),
  url: `https://customer.example/post-${index}`,
  contentType: "post",
  voiceEligible: true,
  modifiedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
}));

test("governed Luna brief makes learned Editorial DNA the house-style authority", () => {
  const brief = createLunaBrief({
    topic: "Current Nepali music",
    customerSummary: "A timely entertainment article",
    rawBrief: {
      website: {
        url: "https://customer.example/",
        name: "Customer Publication",
        tone: "friendly",
        industry: "entertainment",
        audience: "local readers",
      },
      approvedKnowledge: [],
      existingArticleTitles: websiteContent.map((item) => item.title),
      websiteContent,
      externalResearchLeads: {},
    },
    approvedSources: [],
  });

  const dna = brief.editorialDNA as Record<string, any>;
  const delivery = brief.deliveryContract as Record<string, any>;
  const research = brief.researchProtocol as Record<string, any>;
  const voice = brief.brandVoiceEvidence as Record<string, any>;

  assert.equal(dna.schemaVersion, "neo-editorial-dna-v1");
  assert.ok(dna.core.preferredFormats.includes("listicle"));
  assert.ok(dna.core.listicleRatio >= 0.5);
  assert.equal(dna.core.dominantLanguage, "devanagari");
  assert.match(String(dna.authorityRule), /publication defines how/i);
  assert.equal(delivery.editorialConformityMinimum, 70);
  assert.notDeepEqual(delivery.wordRange, { minimum: 900, maximum: 1400 });
  assert.equal(research.sequence[0], "review_editorial_dna");
  assert.ok(research.sequence.includes("verify_editorial_conformity"));
  assert.match(String(voice.instruction), /primary publication-style authority/i);
});

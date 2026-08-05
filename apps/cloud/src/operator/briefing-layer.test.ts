import test from "node:test";
import assert from "node:assert/strict";
import { createLunaBrief } from "./briefing-layer.js";

test("creates a governed customer-specific Luna brief", () => {
  const brief = createLunaBrief({
    topic: "Autism support in Arizona",
    customerSummary: "A practical guide",
    rawBrief: {
      website: { name: "Example Care", tone: "calm and professional", services: ["Autism support"], locations: ["Arizona"] },
      approvedKnowledge: [
        { title: "Autism support", content: "We provide person-centred autism support in Arizona.", sourceUrl: "https://customer.example/autism" },
        { title: "Unrelated", content: "An unrelated page", sourceUrl: "https://customer.example/other" },
      ],
      existingArticleTitles: ["Understanding autism support"],
    },
    approvedSources: [{
      status: "approved", label: "State guidance", url: "https://az.gov/example", publisher: "Arizona",
      purpose: "industry_research", trust_score: 90, freshness_status: "current", approved_claims: ["Approved claim"],
    }, { status: "rejected", url: "https://unsafe.example" }],
  });
  assert.equal(brief.schemaVersion, "neo-luna-brief-v1");
  assert.equal((brief.editorialAssignment as Record<string, unknown>).externalIndustryResearchRequired, true);
  assert.equal((brief.customerProvidedSources as unknown[]).length, 1);
  assert.equal(((brief.customerProvidedSources as Record<string, unknown>[])[0]).researchUsage, "approved_as_evidence_for_listed_claims");
  assert.doesNotMatch(JSON.stringify(brief), /unsafe\.example/);
});

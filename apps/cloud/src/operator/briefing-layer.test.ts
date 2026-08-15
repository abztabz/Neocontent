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
      websiteContent: [{
        title: "Our editorial guide", excerpt: "A calm, practical customer-authored sample.",
        url: "https://customer.example/guide", contentType: "post", voiceEligible: true,
      }],
      externalResearchLeads: {
        generatedAt: "2026-08-15T00:00:00.000Z",
        providers: [{ id: "gdelt-doc", attribution: "GDELT Project", dataBoundary: "Discovery only" }],
        items: [{
          kind: "news", title: "Current signal", url: "https://publisher.example/story",
          publisher: "publisher.example", publishedAt: "2026-08-14T00:00:00.000Z",
          discoveredVia: "gdelt-doc", temporalRole: "current_signal", verificationStatus: "verified",
        }],
      },
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
  assert.equal((((brief.brandVoiceEvidence as Record<string, unknown>).samples as unknown[]).length), 1);
  assert.equal((((brief.customerWebsiteEvidence as Record<string, unknown>).items as unknown[]).length), 1);
  const leads = ((brief.externalResearchLeads as Record<string, unknown>).items as Record<string, unknown>[]);
  assert.equal(leads[0].temporalRole, "current_signal");
  assert.equal(leads[0].verificationStatus, "discovery_only");
  assert.match(String((brief.externalResearchLeads as Record<string, unknown>).instruction), /temporalRole/);
});

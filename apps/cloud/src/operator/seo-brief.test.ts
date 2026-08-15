import assert from "node:assert/strict";
import test from "node:test";
import { createLunaBrief } from "./briefing-layer.js";

test("preserves bounded SEO discovery signals without promoting them to evidence", () => {
  const brief = createLunaBrief({
    topic: "Nepal movie reviews",
    customerSummary: "Current search-language test",
    rawBrief: {
      website: { name: "Example", industry: "entertainment", audience: "Nepali youth" },
      externalResearchLeads: {
        providers: [{ id: "serpapi", dataBoundary: "SERP metadata only" }],
        seoSignals: [{
          discoveredVia: "serpapi",
          organic: [{ position: 1, title: "Ranking page", url: "https://publisher.example/page", domain: "publisher.example", snippet: "must disappear" }],
          relatedQuestions: ["Which Nepali movies are worth watching?"],
          relatedSearches: ["best nepali movies 2026"],
          resultCountEstimate: 900000,
          resultCountMeaning: "unsafe incoming label",
          verificationStatus: "verified",
        }],
      },
    },
    approvedSources: [],
  });
  const external = brief.externalResearchLeads as Record<string, unknown>;
  const signal = (external.seoSignals as Record<string, unknown>[])[0];
  assert.deepEqual(signal.relatedSearches, ["best nepali movies 2026"]);
  assert.equal(signal.verificationStatus, "discovery_only");
  assert.equal(signal.resultCountMeaning, "search_engine_result_estimate_not_search_volume_or_keyword_difficulty");
  assert.equal(JSON.stringify(signal).includes("must disappear"), false);
  assert.match(String(external.instruction), /not proof of search volume/i);
  assert.match(JSON.stringify(brief.researchProtocol), /SERP language/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { generateOpportunities, selectOpportunity } from "./opportunity-engine.js";

test("creates scored keyword and timely research hypotheses without claiming measured volume", () => {
  const opportunities = generateOpportunities({
    businessName: "Example",
    industry: "entertainment media",
    audience: "Nepali audiences",
    services: ["Movie reviews", "Music news"],
    locations: ["Nepal"],
    contentMode: "balanced",
    evidenceCount: 3,
    existingTitles: [],
    now: new Date("2026-08-12T00:00:00.000Z"),
  });
  const selected = selectOpportunity(opportunities);
  assert.equal(selected.keywordEvidence, "research_hypothesis");
  assert.ok(selected.primaryKeyword.length > 0);
  assert.ok(selected.headlineOptions.length >= 3);
  assert.ok(opportunities.some((item) => item.timeliness === "trending" && item.title.includes("August 2026")));
});

test("removes substantially duplicate angles", () => {
  const opportunities = generateOpportunities({
    businessName: "Example",
    industry: "care",
    audience: "families",
    services: ["Home care"],
    contentMode: "balanced",
    evidenceCount: 0,
    existingTitles: ["A Practical Guide to Choosing Home Care"],
    now: new Date("2026-08-12T00:00:00.000Z"),
  });
  assert.equal(opportunities.some((item) => item.title === "A Practical Guide to Choosing Home care"), false);
});

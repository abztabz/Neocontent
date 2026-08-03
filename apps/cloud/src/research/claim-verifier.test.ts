import assert from "node:assert/strict";
import test from "node:test";
import { assertPublishable, verifyClaims } from "./claim-verifier.js";

const source = {
  id: "source-1",
  title: "Ageing at home guidance",
  url: "https://example.gov/guidance",
  publisher: "Example Government",
  publishedAt: "2026-06-01",
  trustScore: 96,
  freshness: "current" as const,
  text: "Ageing at home requires practical safety planning, family support, mobility assessment, and regular review of changing care needs.",
};

test("accepts a material claim linked to relevant trusted evidence", () => {
  const [result] = verifyClaims([
    {
      id: "claim-1",
      text: "Ageing at home benefits from safety planning and regular review of changing care needs.",
      category: "industry",
      sourceIds: [source.id],
    },
  ], [source]);
  assert.equal(result?.supported, true);
  assert.doesNotThrow(() => assertPublishable([result!]));
});

test("blocks an unsupported material claim", () => {
  const results = verifyClaims([
    {
      id: "claim-2",
      text: "A specific service guarantees a fifty percent reduction in hospital admissions.",
      category: "timely",
      sourceIds: [],
    },
  ], [source]);
  assert.equal(results[0]?.supported, false);
  assert.throws(() => assertPublishable(results), /Publication blocked/);
});

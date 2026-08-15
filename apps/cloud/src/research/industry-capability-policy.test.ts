import assert from "node:assert/strict";
import test from "node:test";
import { selectResearchCapabilities } from "./industry-capability-policy.js";

test("uses a general provider-neutral plan for entertainment and media customers", () => {
  const plan = selectResearchCapabilities({
    industry: "entertainment, movie and music",
    services: ["news", "reviews", "music videos"],
    topic: "How to know when news is the right next step",
  });
  assert.deepEqual(plan, {
    profile: "general",
    capabilities: ["news-discovery"],
    reasons: ["current_public_context"],
  });
});

test("adds scholarly discovery for evidence-heavy customer contexts", () => {
  const plan = selectResearchCapabilities({
    industry: "healthcare clinic",
    services: ["mental health", "nutrition"],
    topic: "Supporting caregiver wellbeing",
  });
  assert.equal(plan.profile, "evidence_heavy");
  assert.deepEqual(plan.capabilities, ["news-discovery", "scholarly-discovery"]);
});

test("unknown industries fail safely to the general capability plan", () => {
  const plan = selectResearchCapabilities({ industry: "custom artisan services" });
  assert.equal(plan.profile, "general");
  assert.deepEqual(plan.capabilities, ["news-discovery"]);
});

test("experimental SEO is included only when explicitly enabled", () => {
  const disabled = selectResearchCapabilities({ industry: "retail", experimentalSeoEnabled: false });
  const enabled = selectResearchCapabilities({ industry: "retail", experimentalSeoEnabled: true });
  assert.equal(disabled.capabilities.includes("seo-serp-discovery"), false);
  assert.equal(enabled.capabilities.includes("seo-serp-discovery"), true);
});

test("routing policy never contains provider identifiers or customer text", () => {
  const plan = selectResearchCapabilities({
    industry: "healthcare for Private Customer Name",
    experimentalSeoEnabled: true,
  });
  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes("Private Customer Name"), false);
  assert.equal(serialized.includes("gdelt"), false);
  assert.equal(serialized.includes("crossref"), false);
  assert.equal(serialized.includes("serpapi"), false);
});

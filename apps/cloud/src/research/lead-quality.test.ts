import assert from "node:assert/strict";
import test from "node:test";
import { curateResearchLeads, temporalRole } from "./lead-quality.js";

const now = new Date("2026-08-15T12:00:00.000Z");

test("deduplicates tracking variants of the same HTTPS source", () => {
  const items = curateResearchLeads([
    { kind: "news", title: "Story A", url: "https://Example.com/story?utm_source=x&id=7", publishedAt: "2026-08-15T08:00:00.000Z" },
    { kind: "news", title: "Story A duplicate", url: "https://example.com/story?id=7&utm_medium=social#section", publishedAt: "2026-08-15T08:00:00.000Z" },
  ], now);
  assert.equal(items.length, 1);
  assert.equal(items[0].verificationStatus, "discovery_only");
});

test("deduplicates scholarly records by DOI before URL", () => {
  const items = curateResearchLeads([
    { kind: "scholarly", title: "Paper", doi: "10.1000/ABC", url: "https://doi.org/10.1000/ABC", publishedAt: "2026-01-01" },
    { kind: "scholarly", title: "Paper mirror", doi: "10.1000/abc", url: "https://repository.example/paper", publishedAt: "2026-01-01" },
  ], now);
  assert.equal(items.length, 1);
});

test("labels news leads by recency", () => {
  assert.equal(temporalRole({ kind: "news", publishedAt: "2026-08-14" }, now), "current_signal");
  assert.equal(temporalRole({ kind: "news", publishedAt: "2026-08-05" }, now), "recent_signal");
  assert.equal(temporalRole({ kind: "news", publishedAt: "2026-07-01" }, now), "historical_signal");
});

test("labels scholarly records as recent or established research", () => {
  assert.equal(temporalRole({ kind: "scholarly", publishedAt: "2025-01-01" }, now), "recent_research");
  assert.equal(temporalRole({ kind: "scholarly", publishedAt: "2020-01-01" }, now), "established_research");
  assert.equal(temporalRole({ kind: "scholarly" }, now), "unknown_time");
});

test("forces discovery-only status and caps the brief payload", () => {
  const input = Array.from({ length: 20 }, (_, index) => ({
    kind: "news",
    title: `Story ${index}`,
    url: `https://example.com/story-${index}`,
    publishedAt: "2026-08-15",
    verificationStatus: "verified",
  }));
  const items = curateResearchLeads(input, now);
  assert.equal(items.length, 13);
  assert.ok(items.every((item) => item.verificationStatus === "discovery_only"));
  assert.ok(items.every((item) => item.temporalRole === "current_signal"));
});

import assert from "node:assert/strict";
import test from "node:test";
import { NeoDataGateway } from "./gateway.js";
import { providersFor } from "./registry.js";
import { gdeltAdapter } from "./providers/gdelt.js";
import { crossrefAdapter } from "./providers/crossref.js";

test("production selection excludes experimental providers", () => {
  assert.deepEqual(providersFor("news-discovery").map((provider) => provider.id), ["gdelt-doc"]);
  assert.deepEqual(providersFor("scholarly-discovery").map((provider) => provider.id), ["crossref"]);
  assert.deepEqual(providersFor("company-filings").map((provider) => provider.id), []);
});

test("normalizes GDELT results as discovery-only HTTPS leads", async () => {
  let requested = "";
  const fetcher = (async (input: string | URL | Request) => {
    requested = String(input);
    return new Response(JSON.stringify({ articles: [
      { title: "Useful lead", url: "https://publisher.example/story", domain: "publisher.example", seendate: "20260815083000", language: "English", sourcecountry: "Nepal" },
      { title: "Unsafe transport", url: "http://publisher.example/insecure" },
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const gateway = new NeoDataGateway({ "gdelt-doc": gdeltAdapter(fetcher) });
  const result = await gateway.request("news-discovery", { query: "Nepal entertainment", days: 7, limit: 5 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const rows = result.data as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verificationStatus, "discovery_only");
  assert.match(requested, /mode=artlist/);
  assert.match(requested, /timespan=7d/);
  assert.equal(result.provenance.attribution, "GDELT Project");
});

test("normalizes Crossref bibliographic metadata without carrying abstracts", async () => {
  const fetcher = (async () => new Response(JSON.stringify({
    message: { items: [{
      title: ["Research paper"],
      URL: "https://doi.org/10.1234/example",
      DOI: "10.1234/example",
      publisher: "Example Publisher",
      type: "journal-article",
      published: { "date-parts": [[2026, 8, 1]] },
      abstract: "Copyrighted abstract that must not be propagated",
    }] },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const gateway = new NeoDataGateway({ crossref: crossrefAdapter(fetcher, "research@example.com") });
  const result = await gateway.request("scholarly-discovery", { query: "media literacy", limit: 3 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const rows = result.data as Record<string, unknown>[];
  assert.equal(rows[0].doi, "10.1234/example");
  assert.equal("abstract" in rows[0], false);
  assert.equal(rows[0].publishedAt, "2026-08-01T00:00:00.000Z");
});

test("provider failure is contained inside the gateway", async () => {
  const fetcher = (async () => new Response("unavailable", { status: 503, headers: { "content-type": "text/plain" } })) as typeof fetch;
  const gateway = new NeoDataGateway({ "gdelt-doc": gdeltAdapter(fetcher) });
  const result = await gateway.request("news-discovery", { query: "current topic" });
  assert.equal(result.ok, false);
  assert.equal(result.attempts.length, 1);
});

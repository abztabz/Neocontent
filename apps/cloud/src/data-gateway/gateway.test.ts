import assert from "node:assert/strict";
import test from "node:test";
import { NeoDataGateway } from "./gateway.js";
import { providersFor } from "./registry.js";
import { gdeltAdapter } from "./providers/gdelt.js";
import { crossrefAdapter } from "./providers/crossref.js";
import { dataciteAdapter } from "./providers/datacite.js";

test("production selection excludes experimental providers and preserves approved fallback order", () => {
  assert.deepEqual(providersFor("news-discovery").map((provider) => provider.id), ["gdelt-doc"]);
  assert.deepEqual(providersFor("scholarly-discovery").map((provider) => provider.id), ["crossref", "datacite"]);
  assert.deepEqual(providersFor("company-filings").map((provider) => provider.id), ["sec-edgar"]);
  assert.deepEqual(providersFor("fx-rates").map((provider) => provider.id), ["ecb-data-portal"]);
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

test("falls through empty Crossref results to DataCite", async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.crossref.org")) {
      return new Response(JSON.stringify({ message: { items: [] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: [{
      id: "10.5555/example",
      attributes: {
        doi: "10.5555/example",
        titles: [{ title: "Dataset-backed research" }],
        url: "https://repository.example/item",
        publisher: "Example Repository",
        publicationYear: 2026,
        types: { resourceTypeGeneral: "Dataset" },
      },
    }] }), { status: 200, headers: { "content-type": "application/vnd.api+json" } });
  }) as typeof fetch;
  const gateway = new NeoDataGateway({
    crossref: crossrefAdapter(fetcher),
    datacite: dataciteAdapter(fetcher),
  });
  const result = await gateway.request("scholarly-discovery", { query: "specialized evidence" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.provider, "datacite");
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].outcome, "empty");
  assert.equal((result.data as Record<string, unknown>[])[0].doi, "10.5555/example");
});

test("gateway telemetry records timing and outcome without retaining query or raw errors", async () => {
  const times = [0, 25, 30, 80].map((milliseconds) => new Date(`2026-08-15T00:00:00.${String(milliseconds).padStart(3, "0")}Z`));
  const now = () => times.shift() ?? new Date("2026-08-15T00:00:01.000Z");
  const gateway = new NeoDataGateway({
    crossref: async () => { throw new Error("private topic phrase should never be persisted"); },
    datacite: async () => ({ data: [{ title: "safe normalized row" }] }),
  }, now);
  const result = await gateway.request("scholarly-discovery", { query: "private topic phrase" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.provider, "datacite");
  assert.deepEqual(result.attempts, [{ provider: "crossref", durationMs: 25, outcome: "error" }]);
  assert.equal(result.durationMs, 50);
  const telemetry = JSON.stringify({ attempts: result.attempts, durationMs: result.durationMs, provider: result.provider });
  assert.equal(telemetry.includes("private topic phrase"), false);
});

test("provider failure is contained inside the gateway", async () => {
  const fetcher = (async () => new Response("unavailable", { status: 503, headers: { "content-type": "text/plain" } })) as typeof fetch;
  const gateway = new NeoDataGateway({ "gdelt-doc": gdeltAdapter(fetcher) });
  const result = await gateway.request("news-discovery", { query: "current topic" });
  assert.equal(result.ok, false);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].outcome, "error");
  assert.equal("message" in result.attempts[0], false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { NeoDataGateway } from "./gateway.js";
import { providersFor } from "./registry.js";
import { serpApiAdapter } from "./providers/serpapi.js";
import { zenserpAdapter } from "./providers/zenserp.js";

test("SEO providers fail closed unless experimental selection is explicit", () => {
  assert.deepEqual(providersFor("seo-serp-discovery").map((provider) => provider.id), []);
  assert.deepEqual(
    providersFor("seo-serp-discovery", { includeExperimental: true }).map((provider) => provider.id),
    ["serpapi", "zenserp", "serper"],
  );
});

test("SerpApi normalizes ranking and search-language signals without snippets", async () => {
  let requested = "";
  const fetcher = (async (input: string | URL | Request) => {
    requested = String(input);
    return new Response(JSON.stringify({
      search_information: { total_results: 123456 },
      organic_results: [{ position: 1, title: "Useful result", link: "https://example.com/page", snippet: "Do not retain this snippet" }],
      related_questions: [{ question: "What do people ask?", snippet: "Do not retain answer text" }],
      related_searches: [{ query: "related keyword phrase" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const gateway = new NeoDataGateway({ serpapi: serpApiAdapter("secret-key", fetcher) });
  const result = await gateway.request("seo-serp-discovery", { query: "topic", location: "Nepal" }, { includeExperimental: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.provider, "serpapi");
  assert.match(requested, /engine=google/);
  assert.match(requested, /location=Nepal/);
  const snapshot = (result.data as Record<string, unknown>[])[0];
  assert.equal(snapshot.resultCountEstimate, 123456);
  assert.deepEqual(snapshot.relatedQuestions, ["What do people ask?"]);
  assert.deepEqual(snapshot.relatedSearches, ["related keyword phrase"]);
  assert.equal(JSON.stringify(snapshot).includes("Do not retain"), false);
});

test("Zenserp can act as an experimental fallback", async () => {
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("https://serpapi.com")) return new Response("down", { status: 503 });
    assert.equal((init?.headers as Record<string, string>)?.apikey, "zen-key");
    return new Response(JSON.stringify({
      organic: [
        { position: 1, title: "Fallback result", url: "https://fallback.example/page", description: "Do not retain" },
        { position: 2, questions: [{ question: "Fallback question?" }] },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const gateway = new NeoDataGateway({
    serpapi: serpApiAdapter("serp-key", fetcher),
    zenserp: zenserpAdapter("zen-key", fetcher),
  });
  const result = await gateway.request("seo-serp-discovery", { query: "topic" }, { includeExperimental: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.provider, "zenserp");
  assert.equal(result.attempts.length, 1);
  const snapshot = (result.data as Record<string, unknown>[])[0];
  assert.deepEqual(snapshot.relatedQuestions, ["Fallback question?"]);
  assert.equal(JSON.stringify(snapshot).includes("Do not retain"), false);
});

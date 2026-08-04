import test from "node:test";
import assert from "node:assert/strict";
import { writeArticle } from "./article-writer.js";

test("model prompt excludes encrypted credentials and callback metadata", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let requestBody = "";
  process.env.OPENAI_API_KEY = "test-api-key";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        title: "Safe article",
        excerpt: "Excerpt",
        body: "<p>Body</p>",
        rationale: "Rationale",
        authorityScore: 90,
        businessAlignmentScore: 90,
        verificationScore: 90,
        materialClaims: [],
        sources: [],
      }),
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await writeArticle({
      site: {
        business_name: "Example",
        business_description: "Public description",
        encrypted_site_secret: "never-send-this-ciphertext",
        callback_url: "https://private.example/wp-json/neo-authority/v1/publish",
        external_site_id: "private-site-id",
      },
      opportunity: { title: "Topic" },
      approvedKnowledge: [],
      evidence: [],
      existingTitles: [],
    });
    assert.equal(requestBody.includes("never-send-this-ciphertext"), false);
    assert.equal(requestBody.includes("private.example"), false);
    assert.equal(requestBody.includes("private-site-id"), false);
    assert.equal(requestBody.includes("Public description"), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

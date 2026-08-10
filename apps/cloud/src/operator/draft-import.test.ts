import assert from "node:assert/strict";
import test from "node:test";
import { parseDraftImport } from "./draft-import.js";

const draft = {
  schemaVersion: "neo-blog-draft-v1",
  title: "A governed draft",
  excerpt: "Summary",
  bodyHtml: "<p>Body</p>",
  seoTitle: "SEO title",
  metaDescription: "Description",
  focusKeyphrase: "governed draft",
  rationale: "Reason",
  sources: [],
};

test("accepts raw Luna JSON", () => {
  const parsed = parseDraftImport(JSON.stringify(draft));
  assert.equal(parsed.article.title, draft.title);
  assert.deepEqual(parsed.payload, draft);
});

test("accepts a complete JSON markdown fence", () => {
  const parsed = parseDraftImport(`\uFEFF\n\`\`\`json\n${JSON.stringify(draft, null, 2)}\n\`\`\``);
  assert.equal(parsed.article.body, draft.bodyHtml);
  assert.deepEqual(parsed.payload, draft);
});

test("accepts short surrounding ChatGPT commentary", () => {
  const parsed = parseDraftImport(`Here is the completed draft:\n${JSON.stringify(draft)}\nDone.`);
  assert.equal(parsed.payload.schemaVersion, "neo-blog-draft-v1");
});

test("rejects malformed JSON with an operator-friendly message", () => {
  assert.throws(() => parseDraftImport("{\nschemaVersion: neo-blog-draft-v1\n}"), /not valid JSON/);
});

test("still rejects the wrong governed schema", () => {
  assert.throws(() => parseDraftImport(JSON.stringify({ ...draft, schemaVersion: "wrong" })), /schema is invalid/);
});

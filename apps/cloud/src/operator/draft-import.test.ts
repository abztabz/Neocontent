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
  assert.equal(parsed.payload.schemaVersion, draft.schemaVersion);
  assert.equal(parsed.article.imagePlan?.featured.altText, draft.title);
});

test("accepts a complete JSON markdown fence", () => {
  const parsed = parseDraftImport(`\uFEFF\n\`\`\`json\n${JSON.stringify(draft, null, 2)}\n\`\`\``);
  assert.equal(parsed.article.body, draft.bodyHtml);
  assert.equal(parsed.payload.bodyHtml, draft.bodyHtml);
});

test("accepts short surrounding ChatGPT commentary", () => {
  const parsed = parseDraftImport(`Here is the completed draft:\n${JSON.stringify(draft)}\nDone.`);
  assert.equal(parsed.payload.schemaVersion, "neo-blog-draft-v1");
});

test("repairs iOS smart quotes used as JSON delimiters without changing article quotations", () => {
  const copiedFromIos = "{“schemaVersion”:“neo-blog-draft-v1”,“title”:“A governed draft”,“excerpt”:“Summary”,“bodyHtml”:”<p>Use the “impact test,” then verify it.</p>”,“seoTitle”:“SEO title”,“metaDescription”:“Description”,“focusKeyphrase”:“governed draft”,“rationale”:“Reason”,“sources”:[]}";
  const parsed = parseDraftImport(copiedFromIos);
  assert.equal(parsed.article.title, draft.title);
  assert.equal(parsed.article.body, "<p>Use the “impact test,” then verify it.</p>");
});

test("accepts a realistic iPhone copy with smart delimiters, prose quotations, arrays, and literal line breaks", () => {
  const copiedFromIos = `Luna completed the governed draft:
\`\`\`json
{“schemaVersion”:“neo-blog-draft-v1”,“title”:“When News Is the Right Next Step”,“excerpt”:“A practical guide”,“bodyHtml”:”<p>Use the “impact test,” then verify the claim.</p>
<h2>Check the source</h2><p>Look for the original report.</p><p>Compare the date and publisher.</p><h2>Pause before sharing</h2><p>Separate confirmed facts from commentary.</p>”,“seoTitle”:“When to Check the News”,“metaDescription”:“Know when a viral post needs verification.”,“focusKeyphrase”:“when to check news”,“rationale”:“The article answers a practical reader question.”,“sources”:[{“title”:“Media literacy”,“publisher”:“UNESCO”,“url”:“https://www.unesco.org/en/media-information-literacy”,“claimSupported”:“Supports careful evaluation of information.”}]}
\`\`\`
Copy the object above.`;
  const parsed = parseDraftImport(copiedFromIos);
  assert.equal(parsed.article.title, "When News Is the Right Next Step");
  assert.match(parsed.article.body, /“impact test,” then verify/);
  assert.equal(parsed.article.sources.length, 1);
});

test("accepts an object surrounded by long operator commentary", () => {
  const parsed = parseDraftImport(`${"Context before the draft. ".repeat(150)}\n${JSON.stringify(draft)}\n${"Context after the draft. ".repeat(150)}`);
  assert.equal(parsed.payload.schemaVersion, "neo-blog-draft-v1");
});

test("accepts a safely serialized JSON object", () => {
  const parsed = parseDraftImport(JSON.stringify(JSON.stringify(draft)));
  assert.equal(parsed.article.title, draft.title);
});

test("rejects malformed JSON with an operator-friendly message", () => {
  assert.throws(() => parseDraftImport("{\nschemaVersion: neo-blog-draft-v1\n}"), /not valid JSON/);
});

test("still rejects the wrong governed schema", () => {
  assert.throws(() => parseDraftImport(JSON.stringify({ ...draft, schemaVersion: "wrong" })), /schema is invalid/);
});

test("blocks long wall-of-text drafts without semantic sections", () => {
  assert.throws(() => parseDraftImport(JSON.stringify({
    ...draft,
    bodyHtml: `<p>${"Unstructured copy ".repeat(80)}</p>`,
  })), /two H2 sections/);
});

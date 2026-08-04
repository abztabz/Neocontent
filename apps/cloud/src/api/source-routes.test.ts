import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseRepository } from "../db/supabase.js";
import { decideSource } from "./source-routes.js";

const sourceId = "11111111-1111-4111-8111-111111111111";

function repository(source: Record<string, unknown> | null): SupabaseRepository {
  return {
    findUserSourceForSite: async () => source,
    updateUserSource: async () => ({ id: sourceId, status: "approved" }),
  } as unknown as SupabaseRepository;
}

test("source decision cannot mutate an object outside the authenticated site", async () => {
  await assert.rejects(
    decideSource(repository(null), "site-a", sourceId, "approve", ["Reviewed claim"]),
    /not found for this site/i,
  );
});

test("prompt-injection sources cannot be approved", async () => {
  await assert.rejects(
    decideSource(repository({
      status: "pending_review",
      trust_score: 90,
      failure_reason: "possible prompt-injection instruction",
      suggested_claims: ["Reviewed claim"],
    }), "site-a", sourceId, "approve", ["Reviewed claim"]),
    /unsafe instruction-like content/i,
  );
});

test("approved claims must match the server-reviewed suggestions", async () => {
  await assert.rejects(
    decideSource(repository({
      status: "pending_review",
      trust_score: 90,
      failure_reason: null,
      suggested_claims: ["Reviewed claim"],
    }), "site-a", sourceId, "approve", ["Injected claim" ]),
    /reviewed source suggestions/i,
  );
});

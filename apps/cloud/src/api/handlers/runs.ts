import { createRepository } from "../../runtime.js";
import { authenticateSiteRequest, type SignedRequestLike } from "../authenticate.js";
import { runSite } from "../../runs/run-site.js";

export async function handleRun(
  request: SignedRequestLike,
  payload: { trigger?: "manual" | "scheduled"; idempotencyKey?: string },
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request);
  if (!payload.idempotencyKey) throw new Error("idempotencyKey is required");
  const result = await runSite(
    repository,
    site,
    payload.trigger ?? "manual",
    payload.idempotencyKey as `${string}-${string}-${string}-${string}-${string}`,
  );
  return { status: 200, body: result };
}

import { createRepository } from "../../runtime.js";
import { authenticateSiteRequest, type SignedRequestLike } from "../authenticate.js";
import { addSource, decideSource, type AddSourceRequest } from "../source-routes.js";

export async function handleAddSource(
  request: SignedRequestLike,
  payload: Omit<AddSourceRequest, "siteId" | "organizationId">,
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request);
  const result = await addSource(repository, {
    ...payload,
    organizationId: String(site.organization_id),
    siteId: String(site.id),
  });
  return { status: 201, body: result ?? {} };
}

export async function handleSourceDecision(
  request: SignedRequestLike,
  sourceId: string,
  decision: "approve" | "reject",
  approvedClaims: string[] = [],
) {
  const repository = createRepository();
  await authenticateSiteRequest(repository, request);
  const result = await decideSource(repository, sourceId, decision, approvedClaims);
  return { status: 200, body: result ?? {} };
}

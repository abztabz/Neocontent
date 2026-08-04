import { createRepository } from "../../runtime.js";
import { authenticateSiteRequest, type SignedRequestLike } from "../authenticate.js";
import { addSource, decideSource, type AddSourceRequest } from "../source-routes.js";

export async function handleAddSource(
  request: SignedRequestLike,
  expectedExternalSiteId: string,
  payload: Omit<AddSourceRequest, "siteId" | "organizationId">,
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request, expectedExternalSiteId);
  const result = await addSource(repository, {
    ...payload,
    organizationId: String(site.organization_id),
    siteId: String(site.id),
  });
  return { status: 201, body: result ?? {} };
}

export async function handleSourceDecision(
  request: SignedRequestLike,
  expectedExternalSiteId: string,
  sourceId: string,
  decision: "approve" | "reject",
  approvedClaims: string[] = [],
) {
  const repository = createRepository();
  const site = await authenticateSiteRequest(repository, request, expectedExternalSiteId);
  const result = await decideSource(repository, String(site.id), sourceId, decision, approvedClaims);
  return { status: 200, body: result ?? {} };
}

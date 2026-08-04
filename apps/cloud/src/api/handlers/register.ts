import { createRepository } from "../../runtime.js";
import { registerSite, type RegisterSiteInput } from "../../sites/register-site.js";

export interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

export async function handleRegisterSite(payload: RegisterSiteInput): Promise<ApiResponse> {
  const site = await registerSite(createRepository(), payload);
  return {
    status: 201,
    body: { status: "registered", siteId: site?.external_site_id, internalId: site?.id },
  };
}

import { createRepository } from "../../runtime.js";
import { registerSite, type RegisterSiteInput } from "../../sites/register-site.js";

export interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

export async function handleRegisterSite(payload: RegisterSiteInput): Promise<ApiResponse> {
  try {
    const site = await registerSite(createRepository(), payload);
    return {
      status: 201,
      body: { status: "registered", siteId: site?.external_site_id, internalId: site?.id },
    };
  } catch (error) {
    return {
      status: 400,
      body: {
        error: {
          code: "SITE_REGISTRATION_FAILED",
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      },
    };
  }
}

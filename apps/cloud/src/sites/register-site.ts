import { randomUUID } from "node:crypto";
import { SupabaseRepository } from "../db/supabase.js";
import { encryptSecret } from "../security/secret-vault.js";

export interface RegisterSiteInput {
  siteId: string;
  siteSecret: string;
  websiteUrl: string;
  callbackUrl: string;
  businessName: string;
  businessDescription?: string;
  industry?: string;
  targetAudience?: string;
  tone?: string;
  services?: string[];
  locations?: string[];
  contentMode?: "business_focused" | "balanced" | "industry_authority";
  publishMode?: "auto" | "approval_required";
  cadence?: "daily" | "weekly" | "biweekly" | "monthly";
  knowledgeReviewRequired?: boolean;
}

function requireHttps(value: string, label: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  return url;
}

export async function registerSite(repository: SupabaseRepository, input: RegisterSiteInput) {
  if (!input.siteId || !input.siteSecret) throw new Error("Site credentials are required");
  if (input.siteSecret.length < 32) throw new Error("Site secret is too short");

  const website = requireHttps(input.websiteUrl, "Website URL");
  const callback = requireHttps(input.callbackUrl, "Callback URL");
  if (website.hostname !== callback.hostname) {
    throw new Error("WordPress callback must use the registered website hostname");
  }
  if (!callback.pathname.startsWith("/wp-json/neo-authority/v1/")) {
    throw new Error("WordPress callback path is not recognized");
  }

  const existing = await repository.findSiteByExternalId(input.siteId);
  const organizationId = existing?.organization_id
    ? String(existing.organization_id)
    : String((await repository.createOrganization(input.businessName || "New customer")).id ?? randomUUID());

  return repository.upsertSite({
    organization_id: organizationId,
    external_site_id: input.siteId,
    website_url: website.toString(),
    callback_url: callback.toString(),
    encrypted_site_secret: encryptSecret(input.siteSecret),
    business_name: input.businessName,
    business_description: input.businessDescription ?? "",
    industry: input.industry ?? "",
    target_audience: input.targetAudience ?? "",
    tone: input.tone ?? "Clear, useful, trustworthy and professional",
    services: input.services ?? [],
    locations: input.locations ?? [],
    content_mode: input.contentMode ?? "balanced",
    publish_mode: input.publishMode ?? "approval_required",
    cadence: input.cadence ?? "weekly",
    knowledge_review_required: input.knowledgeReviewRequired !== false,
    enabled: true,
    updated_at: new Date().toISOString(),
  });
}

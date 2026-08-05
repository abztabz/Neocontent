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
  if (typeof value !== "string" || value.length > 2048) throw new Error(`${label} is invalid`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  if (url.port && url.port !== "443") throw new Error(`${label} must use the standard HTTPS port`);
  return url;
}

function limitedText(value: unknown, label: string, maximum: number, required = false): string {
  if (typeof value !== "string") {
    if (required) throw new Error(`${label} is required`);
    return "";
  }
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required`);
  if (normalized.length > maximum) throw new Error(`${label} is too long`);
  return normalized;
}

function limitedList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error(`${label} is invalid`);
  return value.map((item) => limitedText(item, label, 200, true));
}

export function validateRegisterSiteInput(input: RegisterSiteInput): RegisterSiteInput {
  if (!/^[0-9a-f-]{36}$/i.test(input.siteId ?? "")) throw new Error("Site identifier is invalid");
  if (!input.siteSecret || input.siteSecret.length < 32 || input.siteSecret.length > 256) {
    throw new Error("Site secret is invalid");
  }

  const website = requireHttps(input.websiteUrl, "Website URL");
  const callback = requireHttps(input.callbackUrl, "Callback URL");
  if (website.origin !== callback.origin) {
    throw new Error("WordPress callback must use the registered website origin");
  }
  if (!/(?:^|\/)wp-json\/neo-authority\/v1\/publish\/?$/.test(callback.pathname)) {
    throw new Error("WordPress callback path is not recognized");
  }

  const businessName = limitedText(input.businessName, "Business name", 200, true);
  const businessDescription = limitedText(input.businessDescription, "Business description", 5_000);
  const industry = limitedText(input.industry, "Industry", 300);
  const targetAudience = limitedText(input.targetAudience, "Target audience", 2_000);
  const tone = limitedText(input.tone, "Tone", 500);
  const services = limitedList(input.services ?? [], "Services");
  const locations = limitedList(input.locations ?? [], "Locations");

  return {
    siteId: input.siteId,
    siteSecret: input.siteSecret,
    websiteUrl: website.toString(),
    callbackUrl: callback.toString(),
    businessName,
    businessDescription,
    industry,
    targetAudience,
    tone: tone || "Clear, useful, trustworthy and professional",
    services,
    locations,
    contentMode: input.contentMode ?? "balanced",
    publishMode: input.publishMode ?? "approval_required",
    cadence: input.cadence ?? "weekly",
    knowledgeReviewRequired: input.knowledgeReviewRequired !== false,
  };
}

export async function registerSite(repository: SupabaseRepository, input: RegisterSiteInput) {
  const validated = validateRegisterSiteInput(input);
  const existing = await repository.findSiteByExternalId(validated.siteId);
  const organizationId = existing?.organization_id
    ? String(existing.organization_id)
    : String((await repository.createOrganization(validated.businessName)).id ?? randomUUID());

  return repository.upsertSite({
    organization_id: organizationId,
    external_site_id: validated.siteId,
    website_url: validated.websiteUrl,
    callback_url: validated.callbackUrl,
    encrypted_site_secret: encryptSecret(validated.siteSecret),
    business_name: validated.businessName,
    business_description: validated.businessDescription,
    industry: validated.industry,
    target_audience: validated.targetAudience,
    tone: validated.tone,
    services: validated.services,
    locations: validated.locations,
    content_mode: validated.contentMode,
    publish_mode: validated.publishMode,
    cadence: validated.cadence,
    knowledge_review_required: validated.knowledgeReviewRequired,
    workflow_mode: "operator_managed",
    enabled: true,
    updated_at: new Date().toISOString(),
  });
}

export const CONTENT_MODES = Object.freeze([
  "business_focused",
  "balanced",
  "industry_authority",
]);

export const PUBLISH_MODES = Object.freeze([
  "auto",
  "approval_required",
]);

export const SOURCE_PURPOSES = Object.freeze([
  "business_knowledge",
  "industry_research",
  "preferred_research",
  "topic_discovery_only",
]);

export const SOURCE_STATUSES = Object.freeze([
  "pending_fetch",
  "pending_review",
  "approved",
  "rejected",
  "fetch_failed",
]);

export const RUN_STATUSES = Object.freeze([
  "started",
  "researching",
  "generating",
  "verifying",
  "publishing",
  "completed",
  "skipped",
  "failed",
]);

export class DomainValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DomainValidationError";
    this.details = details;
  }
}

function assertEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new DomainValidationError(`Invalid ${field}`, {
      field,
      value,
      allowed,
    });
  }
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainValidationError(`${field} is required`, { field });
  }
}

export function validateSiteProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new DomainValidationError("Site profile is required");
  }

  assertNonEmptyString(profile.businessName, "businessName");
  assertNonEmptyString(profile.targetAudience, "targetAudience");
  assertNonEmptyString(profile.tone, "tone");

  return {
    businessName: profile.businessName.trim(),
    description: String(profile.description || "").trim(),
    industry: String(profile.industry || "").trim(),
    targetAudience: profile.targetAudience.trim(),
    tone: profile.tone.trim(),
    services: Array.isArray(profile.services)
      ? profile.services.map(String).map((item) => item.trim()).filter(Boolean)
      : [],
    locations: Array.isArray(profile.locations)
      ? profile.locations.map(String).map((item) => item.trim()).filter(Boolean)
      : [],
  };
}

export function validateSiteSettings(settings) {
  if (!settings || typeof settings !== "object") {
    throw new DomainValidationError("Site settings are required");
  }

  assertEnum(settings.contentMode, CONTENT_MODES, "contentMode");
  assertEnum(settings.publishMode, PUBLISH_MODES, "publishMode");

  const cadence = String(settings.cadence || "weekly");
  assertEnum(cadence, ["daily", "weekly", "biweekly", "monthly"], "cadence");

  return {
    contentMode: settings.contentMode,
    publishMode: settings.publishMode,
    cadence,
    knowledgeReviewRequired: settings.knowledgeReviewRequired !== false,
    enabled: settings.enabled !== false,
  };
}

export function validateSourceInput(input) {
  if (!input || typeof input !== "object") {
    throw new DomainValidationError("Source input is required");
  }

  let url;
  try {
    url = new URL(input.url);
  } catch {
    throw new DomainValidationError("Source URL is invalid", { field: "url" });
  }

  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new DomainValidationError("Source URL must use HTTP or HTTPS", {
      field: "url",
    });
  }

  assertEnum(input.purpose, SOURCE_PURPOSES, "purpose");

  return {
    url: url.toString(),
    label: String(input.label || "").trim(),
    purpose: input.purpose,
  };
}

export function calculateOpportunityScore(input) {
  const weights = {
    businessRelevance: 0.3,
    authorityGain: 0.25,
    evidenceQuality: 0.2,
    audienceValue: 0.15,
    freshness: 0.1,
  };

  const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));

  return Math.round(
    clamp(input.businessRelevance) * weights.businessRelevance +
      clamp(input.authorityGain) * weights.authorityGain +
      clamp(input.evidenceQuality) * weights.evidenceQuality +
      clamp(input.audienceValue) * weights.audienceValue +
      clamp(input.freshness) * weights.freshness,
  );
}

export function shouldBlockPublication({
  pendingKnowledgeCount,
  knowledgeReviewRequired,
  unsupportedClaimCount,
  duplicateRisk,
  sourceQualityScore,
  minimumSourceQuality = 70,
}) {
  const reasons = [];

  if (knowledgeReviewRequired && pendingKnowledgeCount > 0) {
    reasons.push("PENDING_KNOWLEDGE_REVIEW");
  }
  if (unsupportedClaimCount > 0) {
    reasons.push("UNSUPPORTED_CLAIMS");
  }
  if (duplicateRisk === "high") {
    reasons.push("DUPLICATE_CONTENT_RISK");
  }
  if (sourceQualityScore < minimumSourceQuality) {
    reasons.push("INSUFFICIENT_SOURCE_QUALITY");
  }

  return {
    blocked: reasons.length > 0,
    reasons,
  };
}

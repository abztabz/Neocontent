import assert from "node:assert/strict";
import test from "node:test";
import { capabilityRegistry, providersForCapability, safeRegistrySnapshot } from "./capabilities.js";
import { providerById, providersFor, sourceRegistry } from "./registry.js";

test("every provider capability is declared exactly once in the capability registry", () => {
  const capabilityIds = new Set(capabilityRegistry.map((capability) => capability.id));
  assert.equal(capabilityIds.size, capabilityRegistry.length);
  for (const provider of sourceRegistry) {
    for (const capability of provider.capabilities) assert.equal(capabilityIds.has(capability), true, `${provider.id}: ${capability}`);
  }
});

test("readiness states are mechanically honest", () => {
  for (const capability of capabilityRegistry) {
    const providers = providersForCapability(capability.id);
    const approved = providers.filter((provider) => provider.status === "approved");
    const experimental = providers.filter((provider) => provider.status === "experimental");
    if (capability.readiness === "ready") assert.ok(approved.length > 0, `${capability.id} must have an approved provider`);
    if (capability.readiness === "experimental") {
      assert.equal(approved.length, 0, `${capability.id} cannot be experimental while an approved provider exists`);
      assert.ok(experimental.length > 0, `${capability.id} must have an experimental candidate`);
    }
    if (capability.readiness === "gap") assert.equal(providers.length, 0, `${capability.id} gap must not hide provider candidates`);
  }
});

test("approved production selection never includes blocked or experimental providers", () => {
  for (const capability of capabilityRegistry) {
    assert.ok(providersFor(capability.id).every((provider) => provider.status === "approved"));
  }
  assert.deepEqual(providersFor("scholarly-discovery").map((provider) => provider.id), ["crossref", "datacite"]);
  assert.deepEqual(providersFor("economic-data").map((provider) => provider.id), ["ecb-data-portal", "world-bank-indicators"]);
});

test("all governed providers include review provenance and explicit data boundaries", () => {
  for (const provider of sourceRegistry) {
    assert.match(provider.termsUrl, /^https:\/\//);
    assert.match(provider.documentationUrl, /^https:\/\//);
    assert.match(provider.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(provider.dataBoundary.length >= 30, provider.id);
    assert.ok(provider.regionCoverage.length > 0, provider.id);
    if (provider.auth === "api-key") assert.ok(provider.secretEnvName || provider.status === "blocked", `${provider.id} needs a server-side secret name`);
  }
});

test("known commercial free-tier restrictions remain fail closed", () => {
  assert.equal(providerById("twelve-data")?.freeTierUse, "evaluation_only");
  assert.equal(providerById("open-meteo-free")?.commercialUse, "blocked");
  assert.equal(providerById("tmdb")?.commercialUse, "review_required");
  assert.equal(providerById("gnews-free")?.status, "blocked");
  assert.equal(providerById("guardian-developer")?.status, "blocked");
});

test("safe registry snapshot exposes governance metadata but no secret environment variable names", () => {
  const serialized = JSON.stringify(safeRegistrySnapshot());
  assert.equal(serialized.includes("secretEnvName"), false);
  assert.equal(serialized.includes("NEO_COMPANIES_HOUSE_KEY"), false);
  assert.match(serialized, /company-filings/);
  assert.match(serialized, /language-translation/);
});

import { NeoDataGateway, type GatewayAdapter } from "../data-gateway/gateway.js";
import { gdeltAdapter } from "../data-gateway/providers/gdelt.js";
import { crossrefAdapter } from "../data-gateway/providers/crossref.js";
import { dataciteAdapter } from "../data-gateway/providers/datacite.js";
import { serpApiAdapter } from "../data-gateway/providers/serpapi.js";
import { zenserpAdapter } from "../data-gateway/providers/zenserp.js";
import { boundedQuery } from "../data-gateway/http.js";
import { curateResearchLeads } from "./lead-quality.js";
import { selectResearchCapabilities } from "./industry-capability-policy.js";

type GatewayResult = Awaited<ReturnType<NeoDataGateway["request"]>>;

function itemCount(value: unknown): number {
  return Array.isArray(value) ? value.length : value == null ? 0 : 1;
}

function remoteGatewayConfig() {
  const url = String(process.env.NEO_SOURCE_REGISTRY_URL ?? "").trim().replace(/\/+$/, "");
  const token = String(process.env.NEO_SOURCE_REGISTRY_TOKEN ?? "").trim();
  const consumer = String(process.env.NEO_SOURCE_REGISTRY_CONSUMER ?? "neocontent").trim().toLowerCase();
  return {
    enabled: Boolean(url && token && /^https:\/\//i.test(url)),
    url,
    token,
    consumer: /^[a-z0-9][a-z0-9-]{1,63}$/.test(consumer) ? consumer : "neocontent",
  };
}

async function requestRemoteGateway(
  capability: string,
  input: Record<string, unknown>,
  options: { includeExperimental?: boolean } = {},
): Promise<GatewayResult | null> {
  const config = remoteGatewayConfig();
  if (!config.enabled) return null;

  try {
    const response = await fetch(`${config.url}/v1/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-neo-consumer": config.consumer,
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ capability, input, includeExperimental: options.includeExperimental === true }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const result = payload as Record<string, unknown>;
    if (result.capability !== capability || typeof result.ok !== "boolean" || !Array.isArray(result.attempts)) return null;
    return payload as GatewayResult;
  } catch {
    return null;
  }
}

export async function collectResearchLeads(input: {
  topic: string;
  industry: string;
  location?: string;
  services?: string[];
}) {
  const query = [
    boundedQuery(input.topic, 300),
    boundedQuery(input.industry, 200),
    boundedQuery(input.location, 100),
  ].filter(Boolean).join(" ").slice(0, 500);

  const adapters: Record<string, GatewayAdapter> = {
    "gdelt-doc": gdeltAdapter(),
    crossref: crossrefAdapter(),
    datacite: dataciteAdapter(),
  };
  const serpApiKey = String(process.env.NEO_SERPAPI_KEY ?? "").trim();
  const zenserpKey = String(process.env.NEO_ZENSERP_KEY ?? "").trim();
  if (serpApiKey) adapters.serpapi = serpApiAdapter(serpApiKey);
  if (zenserpKey) adapters.zenserp = zenserpAdapter(zenserpKey);
  const localGateway = new NeoDataGateway(adapters);
  const requestGateway = async (
    capability: string,
    capabilityInput: Record<string, unknown>,
    options: { includeExperimental?: boolean } = {},
  ) => (await requestRemoteGateway(capability, capabilityInput, options))
    ?? localGateway.request(capability, capabilityInput, options);

  const seoEnabled = process.env.NEO_ENABLE_EXPERIMENTAL_SEO === "true" && Boolean(serpApiKey || zenserpKey);
  const routing = selectResearchCapabilities({
    industry: input.industry,
    services: input.services,
    topic: input.topic,
    experimentalSeoEnabled: seoEnabled,
  });
  const results = await Promise.all(routing.capabilities.map((capability) => {
    if (capability === "news-discovery") {
      return requestGateway(capability, { query, days: 14, limit: 8 });
    }
    if (capability === "scholarly-discovery") {
      return requestGateway(capability, { query, limit: 5 });
    }
    return requestGateway(capability, {
      query: boundedQuery(input.topic, 300),
      location: boundedQuery(input.location, 120),
    }, { includeExperimental: true });
  }));
  const evidenceResults = results.filter((result) => result.capability !== "seo-serp-discovery");
  const seo = results.find((result) => result.capability === "seo-serp-discovery") ?? null;
  const successfulEvidence = evidenceResults.filter((result) => result.ok);
  const diagnostics = results.map((result) => result.ok
    ? {
        capability: result.capability,
        status: "ok",
        provider: result.provider,
        itemCount: itemCount(result.data),
        latencyMs: result.durationMs,
        fallbackCount: result.attempts.length,
      }
    : {
        capability: result.capability,
        status: "unavailable",
        itemCount: 0,
        fallbackCount: result.attempts.length,
        attemptedProviders: result.attempts.map((attempt) => attempt.provider),
      });

  console.info("[research-gateway] discovery summary", { diagnostics, remoteGatewayEnabled: remoteGatewayConfig().enabled });

  const generatedAt = new Date();
  const discoveredItems = successfulEvidence.flatMap((result) => Array.isArray(result.data)
    ? result.data.map((item) => ({
        ...(item && typeof item === "object" && !Array.isArray(item) ? item : {}),
        discoveredVia: result.provider,
      }))
    : []);
  const seoSignals = seo?.ok && Array.isArray(seo.data)
    ? seo.data.map((item) => ({
        ...(item && typeof item === "object" && !Array.isArray(item) ? item : {}),
        discoveredVia: seo.provider,
      })).slice(0, 2)
    : [];
  const successful = results.filter((result) => result.ok);

  return {
    generatedAt: generatedAt.toISOString(),
    usage: "discovery_only_requires_independent_verification",
    routing,
    providers: successful.map((result) => ({
      id: result.provider,
      observedAt: result.observedAt,
      attribution: result.provenance.attribution,
      dataBoundary: result.provenance.dataBoundary,
    })),
    items: curateResearchLeads(discoveredItems, generatedAt),
    seoSignals,
    diagnostics,
  };
}

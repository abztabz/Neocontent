import { NeoDataGateway } from "../data-gateway/gateway.js";
import { gdeltAdapter } from "../data-gateway/providers/gdelt.js";
import { crossrefAdapter } from "../data-gateway/providers/crossref.js";
import { dataciteAdapter } from "../data-gateway/providers/datacite.js";
import { boundedQuery } from "../data-gateway/http.js";
import { curateResearchLeads } from "./lead-quality.js";

function itemCount(value: unknown): number {
  return Array.isArray(value) ? value.length : value == null ? 0 : 1;
}

export async function collectResearchLeads(input: {
  topic: string;
  industry: string;
  location?: string;
}) {
  const query = [
    boundedQuery(input.topic, 300),
    boundedQuery(input.industry, 200),
    boundedQuery(input.location, 100),
  ].filter(Boolean).join(" ").slice(0, 500);

  const gateway = new NeoDataGateway({
    "gdelt-doc": gdeltAdapter(),
    crossref: crossrefAdapter(),
    datacite: dataciteAdapter(),
  });

  const [news, scholarly] = await Promise.all([
    gateway.request("news-discovery", { query, days: 14, limit: 8 }),
    gateway.request("scholarly-discovery", { query, limit: 5 }),
  ]);
  const results = [news, scholarly];
  const successful = results.filter((result) => result.ok);
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

  console.info("[research-gateway] discovery summary", { diagnostics });

  const generatedAt = new Date();
  const discoveredItems = successful.flatMap((result) => Array.isArray(result.data)
    ? result.data.map((item) => ({
        ...(item && typeof item === "object" && !Array.isArray(item) ? item : {}),
        discoveredVia: result.provider,
      }))
    : []);

  return {
    generatedAt: generatedAt.toISOString(),
    usage: "discovery_only_requires_independent_verification",
    providers: successful.map((result) => ({
      id: result.provider,
      observedAt: result.observedAt,
      attribution: result.provenance.attribution,
      dataBoundary: result.provenance.dataBoundary,
    })),
    items: curateResearchLeads(discoveredItems, generatedAt),
    diagnostics,
  };
}

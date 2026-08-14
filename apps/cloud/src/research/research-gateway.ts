import { NeoDataGateway } from "../data-gateway/gateway.js";
import { gdeltAdapter } from "../data-gateway/providers/gdelt.js";
import { crossrefAdapter } from "../data-gateway/providers/crossref.js";
import { boundedQuery } from "../data-gateway/http.js";

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
  });

  const news = await gateway.request("news-discovery", { query, days: 14, limit: 8 });
  const scholarly = await gateway.request("scholarly-discovery", { query, limit: 5 });
  const results = [news, scholarly];
  const successful = results.filter((result) => result.ok);

  return {
    generatedAt: new Date().toISOString(),
    usage: "discovery_only_requires_independent_verification",
    providers: successful.map((result) => ({
      id: result.provider,
      observedAt: result.observedAt,
      attribution: result.provenance.attribution,
      dataBoundary: result.provenance.dataBoundary,
    })),
    items: successful.flatMap((result) => Array.isArray(result.data)
      ? result.data.map((item) => ({
          ...(item && typeof item === "object" && !Array.isArray(item) ? item : {}),
          discoveredVia: result.provider,
        }))
      : []).slice(0, 13),
    diagnostics: results.map((result) => result.ok
      ? { capability: result.capability, status: "ok", provider: result.provider }
      : { capability: result.capability, status: "unavailable" }),
  };
}

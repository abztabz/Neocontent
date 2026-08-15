import type { VercelRequestLike, VercelResponseLike } from "../_http.js";
import { capabilityById, safeRegistrySnapshot } from "../../src/data-gateway/capabilities.js";

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  response.setHeader?.("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  response.setHeader?.("Access-Control-Allow-Origin", "*");
  response.setHeader?.("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (request.method === "OPTIONS") return response.status(204).json(null);
  if (request.method !== "GET") return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  const requested = Array.isArray(request.query.capability) ? request.query.capability[0] : request.query.capability;
  const snapshot = safeRegistrySnapshot();
  if (requested) {
    const capability = capabilityById(requested);
    if (!capability) return response.status(404).json({ ok: false, error: "CAPABILITY_NOT_FOUND" });
    const selected = snapshot.find((item) => item.id === requested);
    return response.status(200).json({
      schemaVersion: "neo-source-registry-v1",
      scope: "shared-public-governance-metadata",
      capability: selected,
    });
  }

  return response.status(200).json({
    schemaVersion: "neo-source-registry-v1",
    scope: "shared-public-governance-metadata",
    capabilities: snapshot,
  });
}

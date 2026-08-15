import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequestLike, VercelResponseLike } from "./_http.js";
import { capabilityById, safeRegistrySnapshot } from "../src/data-gateway/capabilities.js";

interface CheckResult {
  status: "ok" | "error" | "not_configured";
  httpStatus?: number;
}

async function checkSupabase(): Promise<CheckResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { status: "error" };

  const response = await fetch(`${url}/rest/v1/organizations?select=id&limit=1`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  });
  return { status: response.ok ? "ok" : "error", httpStatus: response.status };
}

async function checkOpenAI(): Promise<CheckResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { status: "not_configured" };

  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${key}` },
  });
  return { status: response.ok ? "ok" : "error", httpStatus: response.status };
}

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function sendSourceRegistry(request: VercelRequestLike, response: VercelResponseLike) {
  response.setHeader?.("Access-Control-Allow-Origin", "*");
  const requested = firstQueryValue(request.query.capability).trim();
  const snapshot = safeRegistrySnapshot();
  if (requested) {
    const capability = capabilityById(requested);
    if (!capability) return response.status(404).json({ ok: false, error: "CAPABILITY_NOT_FOUND" });
    return response.status(200).json({
      schemaVersion: "neo-source-registry-v1",
      scope: "shared-public-governance-metadata",
      capability: snapshot.find((item) => item.id === requested),
    });
  }
  return response.status(200).json({
    schemaVersion: "neo-source-registry-v1",
    scope: "shared-public-governance-metadata",
    capabilities: snapshot,
  });
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "GET") {
    return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  if (firstQueryValue(request.query.view) === "source-registry") {
    return sendSourceRegistry(request, response);
  }

  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expected = process.env.CRON_SECRET ?? "";
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  const maySeeDetails = Boolean(supplied && expected && timingSafeEqual(suppliedHash, expectedHash));
  if (!maySeeDetails) {
    return response.status(200).json({ ok: true, service: "neo-authority-cloud" });
  }

  const [supabase, openai] = await Promise.all([
    checkSupabase().catch(() => ({ status: "error" as const })),
    checkOpenAI().catch(() => ({ status: "error" as const })),
  ]);
  const configuration = {
    encryptionKey: Boolean(process.env.NEO_SECRET_ENCRYPTION_KEY),
    cronSecret: Boolean(process.env.CRON_SECRET),
    registrationToken: Boolean(process.env.NEO_REGISTRATION_TOKEN),
    operatorToken: (process.env.NEO_OPERATOR_TOKEN ?? "").length >= 32,
  };
  const ok = supabase.status === "ok"
    && configuration.encryptionKey
    && configuration.cronSecret
    && configuration.registrationToken
    && configuration.operatorToken;

  response.status(ok ? 200 : 503).json({
    ok,
    service: "neo-authority-cloud",
    checks: { supabase, openai, configuration },
  });
}

import type { VercelRequestLike, VercelResponseLike } from "./_http.js";

interface CheckResult {
  status: "ok" | "error";
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
  if (!key) return { status: "error" };

  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${key}` },
  });
  return { status: response.ok ? "ok" : "error", httpStatus: response.status };
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "GET") {
    return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const [supabase, openai] = await Promise.all([
    checkSupabase().catch(() => ({ status: "error" as const })),
    checkOpenAI().catch(() => ({ status: "error" as const })),
  ]);
  const configuration = {
    encryptionKey: Boolean(process.env.NEO_SECRET_ENCRYPTION_KEY),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };
  const ok = supabase.status === "ok"
    && openai.status === "ok"
    && configuration.encryptionKey
    && configuration.cronSecret;

  response.status(ok ? 200 : 503).json({
    ok,
    service: "neo-authority-cloud",
    checks: { supabase, openai, configuration },
  });
}

import { canonicalJson } from "../src/security/signatures.js";

export interface VercelRequestLike {
  method?: string;
  url?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}

export interface VercelResponseLike {
  status(code: number): VercelResponseLike;
  setHeader?(name: string, value: string | string[]): VercelResponseLike;
  send?(payload: string): void;
  json(payload: unknown): void;
}

export function rawBody(request: VercelRequestLike): string {
  if (typeof request.body === "string") {
    try {
      return canonicalJson(JSON.parse(request.body));
    } catch {
      return request.body;
    }
  }
  return canonicalJson(request.body ?? {});
}

export function normalizedHeaders(request: VercelRequestLike): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

export function sendError(response: VercelResponseLike, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const rules: Array<{ pattern: RegExp; status: number; code: string }> = [
    { pattern: /rate limit/i, status: 429, code: "RATE_LIMITED" },
    { pattern: /replay|duplicate key|23505/i, status: 409, code: "CONFLICT" },
    { pattern: /not found|was not found/i, status: 404, code: "NOT_FOUND" },
    { pattern: /signature|signed request|not registered|enrollment token/i, status: 401, code: "UNAUTHORIZED" },
    { pattern: /invalid|required|too (?:short|long)|must use|must not|at most|only accepts|not recognized/i, status: 400, code: "INVALID_REQUEST" },
    { pattern: /publication blocked|below the V1 threshold|requires verified evidence|require approval|generation is disabled/i, status: 422, code: "POLICY_BLOCKED" },
  ];
  const matched = rules.find((rule) => rule.pattern.test(message));
  const status = matched?.status ?? 500;
  if (status === 500) console.error("Neo Authority request failed", { name: error instanceof Error ? error.name : "Error" });
  response.status(status).json({
    error: {
      code: matched?.code ?? "INTERNAL_ERROR",
      message: status === 500 ? "The request could not be completed" : message,
      retryable: false,
    },
  });
}

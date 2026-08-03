export interface VercelRequestLike {
  method?: string;
  url?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}

export interface VercelResponseLike {
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
}

export function rawBody(request: VercelRequestLike): string {
  if (typeof request.body === "string") return request.body;
  return JSON.stringify(request.body ?? {});
}

export function normalizedHeaders(request: VercelRequestLike): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

export function sendError(response: VercelResponseLike, error: unknown): void {
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
    },
  });
}

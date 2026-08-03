import type { IncomingMessage, ServerResponse } from "node:http";

export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

export function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

export function sendError(response: ServerResponse, error: unknown, status = 400): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  sendJson(response, status, { error: { code: "REQUEST_FAILED", message } });
}

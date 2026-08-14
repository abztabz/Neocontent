const MAXIMUM_RESPONSE_BYTES = 1_000_000;

export type ProviderFetcher = typeof fetch;

export async function fetchProviderJson(
  url: URL,
  options: {
    fetcher?: ProviderFetcher;
    timeoutMs?: number;
    headers?: Record<string, string>;
    allowedOrigin: string;
  },
): Promise<Record<string, unknown>> {
  if (url.protocol !== "https:" || url.origin !== options.allowedOrigin || url.username || url.password) {
    throw new Error("Provider URL is outside the approved origin");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(options.timeoutMs ?? 7_000, 1_000), 12_000));
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: { accept: "application/json", ...(options.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("json")) throw new Error("Provider did not return JSON");
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAXIMUM_RESPONSE_BYTES) throw new Error("Provider response is too large");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Provider JSON payload is invalid");
    return parsed as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export function boundedQuery(value: unknown, maximum = 300): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

export function httpsUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "";
  } catch {
    return "";
  }
}

import { constantTimeEqual, operatorSessionDigest } from "./auth.js";
import type { VercelRequestLike } from "../../api/_http.js";

export function operatorCookies(request: VercelRequestLike): Record<string, string> {
  const raw = String(request.headers.cookie ?? "");
  return Object.fromEntries(raw.split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value)]));
}

export function isOperatorAuthenticated(request: VercelRequestLike): boolean {
  const token = process.env.NEO_OPERATOR_TOKEN ?? "";
  const session = operatorCookies(request).neo_operator_session ?? "";
  return token.length >= 32 && constantTimeEqual(session, operatorSessionDigest(token));
}

export function assertOperatorCsrf(request: VercelRequestLike, body: Record<string, unknown>): void {
  const cookie = operatorCookies(request).neo_operator_csrf ?? "";
  const supplied = String(body.csrf ?? "");
  if (!cookie || !supplied || !constantTimeEqual(cookie, supplied)) throw new Error("Invalid operator request token");
}

export function assertSameOrigin(request: VercelRequestLike): void {
  const origin = String(request.headers.origin ?? "");
  const forwardedHost = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "").split(",")[0].trim();
  const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "https").split(",")[0].trim();
  if (!origin || !forwardedHost) throw new Error("Operator request origin is required");
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new Error("Operator request origin is invalid"); }
  if (parsed.protocol !== `${forwardedProto}:` || parsed.host !== forwardedHost) throw new Error("Operator request origin is invalid");
}

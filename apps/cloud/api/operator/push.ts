import { createRepository } from "../../src/runtime.js";
import { assertOperatorCsrf, assertSameOrigin, isOperatorAuthenticated } from "../../src/operator/http-auth.js";
import { removeOperatorSubscription, saveOperatorSubscription, sendOperatorNotification } from "../../src/operator/push-notifications.js";
import type { VercelRequestLike, VercelResponseLike } from "../_http.js";

function fail(response: VercelResponseLike, status: number, message: string): void {
  response.status(status).json({ ok: false, error: message });
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "POST") return fail(response, 405, "Method not allowed");
  if (!isOperatorAuthenticated(request)) return fail(response, 401, "Authentication required");
  const body = (request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body : {}) as Record<string, unknown>;
  try {
    assertSameOrigin(request);
    assertOperatorCsrf(request, body);
    const action = String(body.action ?? "");
    const repository = createRepository();
    if (action === "subscribe") await saveOperatorSubscription(repository, body.subscription);
    else if (action === "unsubscribe") await removeOperatorSubscription(repository, body.subscription);
    else if (action === "test") await sendOperatorNotification(repository, "test", "test");
    else return fail(response, 400, "Push action is invalid");
    response.status(200).json({ ok: true });
  } catch (error) {
    fail(response, 400, error instanceof Error ? error.message : "Push request failed");
  }
}

import crypto from "node:crypto";
import webpush, { type PushSubscription } from "web-push";
import { decryptSecret, encryptSecret } from "../security/secret-vault.js";
import type { SupabaseRepository } from "../db/supabase.js";

const MAX_OPERATOR_SUBSCRIPTIONS = 5;
const allowedPushHosts = [
  "web.push.apple.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
];

export type OperatorNotificationKind = "brief_ready" | "changes_requested" | "delivery_failed" | "connection_requested" | "test";

export interface BrowserPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

export type PushSender = (subscription: PushSubscription, payload: string) => Promise<unknown>;

export function genericOperatorPayload(kind: OperatorNotificationKind): string {
  const body = kind === "test" ? "Notifications are enabled on this device." : "An item requires your attention.";
  return JSON.stringify({
    title: "NeoContent",
    body,
    url: "/api/operator?view=action",
    tag: kind === "test" ? "neo-test" : "neo-action-required",
  });
}

export function validatePushSubscription(value: unknown): BrowserPushSubscription {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Push subscription is invalid");
  const input = value as Record<string, unknown>;
  const endpoint = String(input.endpoint ?? "");
  const keys = input.keys as Record<string, unknown> | undefined;
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("Push subscription endpoint is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowedPushHosts.includes(url.hostname)) {
    throw new Error("Push subscription endpoint is not allowed");
  }
  if (endpoint.length > 2048 || !keys || typeof keys !== "object") throw new Error("Push subscription is invalid");
  const p256dh = String(keys.p256dh ?? "");
  const auth = String(keys.auth ?? "");
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{12,100}$/.test(auth)) throw new Error("Push subscription keys are invalid");
  return { endpoint, expirationTime: typeof input.expirationTime === "number" ? input.expirationTime : null, keys: { p256dh, auth } };
}

export function endpointHash(endpoint: string): string {
  return crypto.createHash("sha256").update(endpoint).digest("hex");
}

function configureWebPush(): void {
  const subject = process.env.NEO_VAPID_SUBJECT ?? "";
  const publicKey = process.env.NEO_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.NEO_VAPID_PRIVATE_KEY ?? "";
  if (!/^mailto:.+@.+\..+$|^https:\/\/.+/.test(subject) || !publicKey || !privateKey) throw new Error("Web Push configuration is incomplete");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function saveOperatorSubscription(repository: SupabaseRepository, raw: unknown): Promise<void> {
  const subscription = validatePushSubscription(raw);
  const hash = endpointHash(subscription.endpoint);
  await repository.upsertOperatorPushSubscription({ endpoint_hash: hash, subscription_encrypted: encryptSecret(JSON.stringify(subscription)), last_seen_at: new Date().toISOString() });
  await repository.trimOperatorPushSubscriptions(MAX_OPERATOR_SUBSCRIPTIONS);
}

export async function removeOperatorSubscription(repository: SupabaseRepository, raw: unknown): Promise<void> {
  const subscription = validatePushSubscription(raw);
  await repository.deleteOperatorPushSubscription(endpointHash(subscription.endpoint));
}

export async function sendOperatorNotification(repository: SupabaseRepository, kind: OperatorNotificationKind, eventKey: string, sender?: PushSender): Promise<void> {
  if (kind !== "test") {
    const created = await repository.insertOperatorNotificationOutbox({ event_key: eventKey, notification_type: kind });
    if (!created) return;
  }
  if (!sender) configureWebPush();
  const subscriptions = await repository.listOperatorPushSubscriptions(MAX_OPERATOR_SUBSCRIPTIONS);
  const payload = genericOperatorPayload(kind);
  let sent = 0;
  for (const record of subscriptions) {
    try {
      const subscription = JSON.parse(decryptSecret(String(record.subscription_encrypted))) as PushSubscription;
      if (sender) await sender(subscription, payload);
      else await webpush.sendNotification(subscription, payload, { TTL: 300, urgency: "high" });
      sent += 1;
      await repository.touchOperatorPushSubscription(String(record.endpoint_hash));
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) await repository.deleteOperatorPushSubscription(String(record.endpoint_hash));
    }
  }
  if (kind !== "test") await repository.completeOperatorNotificationOutbox(eventKey, sent);
}

export async function notifyOperatorSafely(repository: SupabaseRepository, kind: Exclude<OperatorNotificationKind, "test">, eventKey: string): Promise<void> {
  try { await sendOperatorNotification(repository, kind, eventKey); } catch { /* Notification failure must never break content workflow. */ }
}

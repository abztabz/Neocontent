import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecret } from "../security/secret-vault.js";
import { genericOperatorPayload, sendOperatorNotification, validatePushSubscription } from "./push-notifications.js";

const validSubscription = {
  endpoint: "https://web.push.apple.com/Q".padEnd(70, "x"),
  keys: { p256dh: "A".repeat(64), auth: "B".repeat(24) },
};

test("push endpoints are allowlisted and malformed endpoints are rejected", () => {
  assert.equal(validatePushSubscription(validSubscription).endpoint, validSubscription.endpoint);
  assert.throws(() => validatePushSubscription({ ...validSubscription, endpoint: "https://example.com/internal" }), /not allowed/);
  assert.throws(() => validatePushSubscription({ ...validSubscription, endpoint: "http://web.push.apple.com/x" }), /not allowed/);
});

test("operator push payload contains no customer, topic, count, or job identifiers", () => {
  const payload = genericOperatorPayload("brief_ready");
  assert.deepEqual(JSON.parse(payload), {
    title: "NeoContent",
    body: "An item requires your attention.",
    url: "/api/operator?view=action",
    tag: "neo-action-required",
  });
  assert.doesNotMatch(payload, /customer|topic|count|job/i);
});

test("notification outbox makes duplicate event sends idempotent", async () => {
  let inserted = false;
  let sends = 0;
  const repository = {
    insertOperatorNotificationOutbox: async () => inserted ? null : (inserted = true, {}),
    listOperatorPushSubscriptions: async () => [],
    completeOperatorNotificationOutbox: async () => null,
  } as never;
  const sender = async () => { sends += 1; };
  await sendOperatorNotification(repository, "brief_ready", "brief-ready:1", sender);
  await sendOperatorNotification(repository, "brief_ready", "brief-ready:1", sender);
  assert.equal(sends, 0);
});

test("expired subscriptions are revoked after a 410 response", async () => {
  process.env.NEO_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  let revoked = "";
  const repository = {
    insertOperatorNotificationOutbox: async () => ({}),
    listOperatorPushSubscriptions: async () => [{ endpoint_hash: "hash", subscription_encrypted: encryptSecret(JSON.stringify(validSubscription)) }],
    deleteOperatorPushSubscription: async (hash: string) => { revoked = hash; },
    completeOperatorNotificationOutbox: async () => null,
  } as never;
  await sendOperatorNotification(repository, "brief_ready", "brief-ready:2", async () => { throw { statusCode: 410 }; });
  assert.equal(revoked, "hash");
});

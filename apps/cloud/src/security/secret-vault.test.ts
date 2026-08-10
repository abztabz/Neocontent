import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./secret-vault.js";

function withEncryptionKey(key: string, callback: () => void) {
  const previousKey = process.env.NEO_SECRET_ENCRYPTION_KEY;
  process.env.NEO_SECRET_ENCRYPTION_KEY = key;
  try {
    callback();
  } finally {
    if (previousKey === undefined) delete process.env.NEO_SECRET_ENCRYPTION_KEY;
    else process.env.NEO_SECRET_ENCRYPTION_KEY = previousKey;
  }
}

test("secret vault accepts a base64-encoded 32-byte encryption key", () => {
  withEncryptionKey(randomBytes(32).toString("base64"), () => {
    const encrypted = encryptSecret("site-secret");
    assert.equal(decryptSecret(encrypted), "site-secret");
  });
});

test("secret vault accepts a long random text encryption secret", () => {
  withEncryptionKey("plain-random-production-secret-with-more-than-32-characters", () => {
    const encrypted = encryptSecret("site-secret");
    assert.equal(decryptSecret(encrypted), "site-secret");
  });
});

test("secret vault accepts long secrets that contain non-base64 characters", () => {
  withEncryptionKey("bKGØ-random-production-secret-with-more-than-32-characters", () => {
    const encrypted = encryptSecret("site-secret");
    assert.equal(decryptSecret(encrypted), "site-secret");
  });
});

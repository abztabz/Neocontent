import crypto from "node:crypto";

function encryptionKey(): Buffer {
  const secret = (process.env.NEO_SECRET_ENCRYPTION_KEY ?? "").trim();
  if (secret.length < 32) {
    throw new Error("NEO_SECRET_ENCRYPTION_KEY must be at least 32 characters");
  }

  const base64UrlPattern = /^[A-Za-z0-9_-]+={0,2}$/;
  if (base64UrlPattern.test(secret)) {
    const normalized = secret.replace(/-/g, "+").replace(/_/g, "/");
    const key = Buffer.from(normalized, "base64");
    if (key.length === 32) return key;
  }

  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivText, tagText, ciphertextText] = payload.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Encrypted secret is malformed");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

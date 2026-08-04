import { createHash, timingSafeEqual } from "node:crypto";

export function operatorSessionDigest(token: string): string {
  return createHash("sha256").update(`neo-operator-v1:${token}`).digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyOperatorToken(supplied: string, expected: string): boolean {
  return expected.length >= 32 && constantTimeEqual(operatorSessionDigest(supplied), operatorSessionDigest(expected));
}

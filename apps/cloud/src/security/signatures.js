import crypto from 'node:crypto';

const MAX_CLOCK_SKEW_SECONDS = 300;

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function canonicalRequest({ method, path, timestamp, body }) {
  return [method.toUpperCase(), path, String(timestamp), sha256(body)].join('\n');
}

export function signRequest({ secret, method, path, timestamp, body = '' }) {
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalRequest({ method, path, timestamp, body }))
    .digest('hex');
}

export function verifyRequest({ secret, method, path, timestamp, body = '', signature, now = Date.now() }) {
  if (!secret || !timestamp || !signature) return false;

  const requestTime = Number(timestamp) * 1000;
  if (!Number.isFinite(requestTime)) return false;
  if (Math.abs(now - requestTime) > MAX_CLOCK_SKEW_SECONDS * 1000) return false;

  const expected = signRequest({ secret, method, path, timestamp, body });
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const suppliedBuffer = Buffer.from(String(signature), 'utf8');

  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

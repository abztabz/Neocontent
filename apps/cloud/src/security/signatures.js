import crypto from 'node:crypto';

const MAX_CLOCK_SKEW_SECONDS = 300;

function normalizeJsonValue(value) {
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeJsonValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(normalizeJsonValue(value));
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function canonicalRequest({ method, path, timestamp, body }) {
  return [method.toUpperCase(), path, String(timestamp), sha256(body)].join('\n');
}

export function deriveSigningKey(secret, purpose = 'plugin-to-cloud') {
  const labels = {
    'plugin-to-cloud': 'neo-plugin-to-cloud-v1',
    'cloud-to-wordpress': 'neo-cloud-to-wordpress-v1',
    'cloud-activation': 'neo-cloud-activation-v1',
    'cloud-pending': 'neo-cloud-pending-v1',
    registration: 'neo-registration-v1',
  };
  const label = labels[purpose];
  if (!label) throw new Error('Unknown signing purpose');
  return crypto.createHmac('sha256', secret).update(label).digest();
}

export function signRequest({ secret, purpose = 'plugin-to-cloud', method, path, timestamp, body = '' }) {
  return crypto
    .createHmac('sha256', deriveSigningKey(secret, purpose))
    .update(canonicalRequest({ method, path, timestamp, body }))
    .digest('hex');
}

export function verifyRequest({ secret, purpose = 'plugin-to-cloud', method, path, timestamp, body = '', signature, now = Date.now() }) {
  if (!secret || !timestamp || !signature) return false;

  const requestTime = Number(timestamp) * 1000;
  if (!Number.isFinite(requestTime)) return false;
  if (Math.abs(now - requestTime) > MAX_CLOCK_SKEW_SECONDS * 1000) return false;

  const expected = signRequest({ secret, purpose, method, path, timestamp, body });
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const suppliedBuffer = Buffer.from(String(signature), 'utf8');

  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

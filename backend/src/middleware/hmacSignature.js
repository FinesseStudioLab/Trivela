// @ts-check
import { createHmac, timingSafeEqual } from 'node:crypto';

const TIMESTAMP_HEADER = 'x-trivela-timestamp';
const NONCE_HEADER = 'x-trivela-nonce';
const SIGNATURE_HEADER = 'x-trivela-signature';

const CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes — double the window to survive clock drift

/**
 * In-memory nonce store: nonce → expiry timestamp.
 * Grows at most to 2 * CLOCK_SKEW / avg-request-interval entries; fine for most deployments.
 * Replace with a Redis SET NX PEXPIRE call for multi-instance deployments.
 */
const nonceStore = new Map();

let lastCleanup = Date.now();

function evictExpiredNonces() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [nonce, expiresAt] of nonceStore) {
    if (now > expiresAt) nonceStore.delete(nonce);
  }
}

function reject(res, status, message) {
  res.status(status).json({ error: message });
}

/**
 * Verify HMAC-SHA256 request signature for partner/admin routes.
 *
 * Callers must sign: `${timestamp}.${nonce}.${rawBodyHex}` where rawBodyHex is the
 * hex-encoded UTF-8 request body (empty string → "").
 *
 * Required headers:
 *   X-Trivela-Timestamp — Unix epoch seconds (string)
 *   X-Trivela-Nonce     — random UUID or comparable entropy string
 *   X-Trivela-Signature — `hmac-sha256=<lowercase hex>`
 *
 * @param {object} [opts]
 * @param {string} [opts.secret]   Override env PARTNER_HMAC_SECRET for this route group.
 * @returns {import('express').RequestHandler}
 */
export function createHmacSignatureMiddleware(opts = {}) {
  return function hmacSignatureMiddleware(req, res, next) {
    const secret = opts.secret ?? process.env.PARTNER_HMAC_SECRET ?? '';
    if (!secret) {
      return reject(res, 500, 'HMAC secret not configured');
    }

    const tsHeader = req.headers[TIMESTAMP_HEADER];
    const nonce = req.headers[NONCE_HEADER];
    const sigHeader = req.headers[SIGNATURE_HEADER];

    if (!tsHeader || !nonce || !sigHeader) {
      return reject(res, 401, 'Missing HMAC signature headers');
    }

    const tsSeconds = Number(tsHeader);
    if (!Number.isFinite(tsSeconds)) {
      return reject(res, 401, 'Invalid timestamp');
    }

    const now = Date.now();
    const tsMs = tsSeconds * 1000;
    if (Math.abs(now - tsMs) > CLOCK_SKEW_MS) {
      return reject(res, 401, 'Request timestamp outside acceptable window');
    }

    evictExpiredNonces();

    const nonceKey = String(nonce);
    if (nonceStore.has(nonceKey)) {
      return reject(res, 401, 'Nonce already used (replay detected)');
    }

    // Raw body must be available as Buffer on req.rawBody (set by express.raw or body-parser verify)
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body ?? ''));

    const material = `${tsHeader}.${nonceKey}.${rawBody.toString('hex')}`;
    const expected = createHmac('sha256', secret).update(material).digest('hex');

    const provided = String(sigHeader).replace(/^hmac-sha256=/i, '');

    let match = false;
    try {
      match = timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
    } catch {
      // buffers differ in length → definitely wrong
    }

    if (!match) {
      return reject(res, 401, 'Invalid HMAC signature');
    }

    nonceStore.set(nonceKey, now + NONCE_TTL_MS);
    next();
  };
}

// Expose internals for testing
export { nonceStore, CLOCK_SKEW_MS, TIMESTAMP_HEADER, NONCE_HEADER, SIGNATURE_HEADER };

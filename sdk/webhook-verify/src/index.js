import crypto from 'node:crypto';

/**
 * @typedef {{ id: string, type: string, timestamp: string, data: unknown }} TrivielaWebhookEvent
 */

/**
 * Compute the HMAC-SHA256 hex signature for a raw payload string.
 * This matches the value Trivela sends in the `X-Trivela-Signature` header.
 *
 * @param {string} secret  - Webhook signing secret from the Trivela dashboard.
 * @param {string} payload - Raw request body string (UTF-8).
 * @returns {string} Lowercase hex digest.
 */
export function generateSignature(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Verify a Trivela webhook signature using a timing-safe comparison.
 * Returns `false` instead of throwing on length mismatch so callers can
 * distinguish a bad signature from a misconfigured secret.
 *
 * @param {string} signature - Value of the `X-Trivela-Signature` header.
 * @param {string} secret    - Webhook signing secret.
 * @param {string} payload   - Raw request body string.
 * @returns {boolean}
 */
export function verifyWebhookSignature(signature, secret, payload) {
  const expected = generateSignature(secret, payload);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    // timingSafeEqual throws when buffers differ in length (i.e. truncated/invalid hex)
    return false;
  }
}

/**
 * Parse and verify a Trivela webhook request.
 * Throws with a clear message when the signature is invalid so integrators
 * can return a 400 to Trivela and avoid processing tampered payloads.
 *
 * @param {string} payload   - Raw request body string (do NOT parse JSON before passing).
 * @param {string} signature - Value of the `X-Trivela-Signature` header.
 * @param {string} secret    - Webhook signing secret from the Trivela dashboard.
 * @returns {TrivielaWebhookEvent} Parsed webhook event.
 * @throws {Error} When the signature does not match.
 *
 * @example
 * // Express
 * app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
 *   const sig = req.headers['x-trivela-signature'];
 *   let event;
 *   try {
 *     event = constructEvent(req.body.toString(), sig, process.env.TRIVELA_WEBHOOK_SECRET);
 *   } catch (err) {
 *     return res.status(400).send(`Webhook error: ${err.message}`);
 *   }
 *   // handle event.type …
 *   res.sendStatus(200);
 * });
 */
export function constructEvent(payload, signature, secret) {
  if (!verifyWebhookSignature(signature, secret, payload)) {
    throw new Error(
      'Trivela webhook signature verification failed. ' +
        'Ensure you are passing the raw request body and the correct signing secret.',
    );
  }
  return JSON.parse(payload);
}

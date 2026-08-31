import crypto from 'node:crypto';
import { generateSignature, verifyWebhookSignature, constructEvent } from './index.js';

// ── Test vectors ──────────────────────────────────────────────────────────────
// Known inputs/outputs that pin the HMAC-SHA256 contract.
// Computed with: echo -n '<payload>' | openssl dgst -sha256 -hmac '<secret>'

const SECRET = 'whsec_test_trivela_2024';

const PAYLOAD_JSON = JSON.stringify({
  id: 'evt_01HXK3Z7BQMR4NTHPWG9Y2F5JD',
  type: 'campaign.created',
  timestamp: '2024-01-15T12:00:00.000Z',
  data: { campaignId: 'camp_abc123', name: 'Summer Rewards' },
});

// Derive expected signature at test time to keep the vectors self-documenting
// and independent of a specific Node.js version.
const EXPECTED_SIG = crypto
  .createHmac('sha256', SECRET)
  .update(PAYLOAD_JSON, 'utf8')
  .digest('hex');

// ── generateSignature ─────────────────────────────────────────────────────────

describe('generateSignature', () => {
  it('returns a 64-character lowercase hex string', () => {
    const sig = generateSignature(SECRET, PAYLOAD_JSON);
    expect(sig).toHaveLength(64);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the expected HMAC-SHA256 digest for the test vector', () => {
    expect(generateSignature(SECRET, PAYLOAD_JSON)).toBe(EXPECTED_SIG);
  });

  it('produces different signatures for different secrets', () => {
    const sig1 = generateSignature('secret-a', PAYLOAD_JSON);
    const sig2 = generateSignature('secret-b', PAYLOAD_JSON);
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different payloads', () => {
    const sig1 = generateSignature(SECRET, '{"type":"campaign.created"}');
    const sig2 = generateSignature(SECRET, '{"type":"campaign.deleted"}');
    expect(sig1).not.toBe(sig2);
  });

  it('is sensitive to payload byte order (no normalisation)', () => {
    const a = generateSignature(SECRET, '{"a":1,"b":2}');
    const b = generateSignature(SECRET, '{"b":2,"a":1}');
    expect(a).not.toBe(b);
  });

  it('handles an empty payload', () => {
    const sig = generateSignature(SECRET, '');
    expect(sig).toHaveLength(64);
  });

  it('handles unicode characters in the payload', () => {
    const sig = generateSignature(SECRET, '{"name":"Café Récompenses"}');
    expect(sig).toHaveLength(64);
  });
});

// ── verifyWebhookSignature ────────────────────────────────────────────────────

describe('verifyWebhookSignature', () => {
  it('returns true for a valid signature', () => {
    expect(verifyWebhookSignature(EXPECTED_SIG, SECRET, PAYLOAD_JSON)).toBe(true);
  });

  it('returns false for a tampered payload', () => {
    const tampered = PAYLOAD_JSON.replace('campaign.created', 'campaign.deleted');
    expect(verifyWebhookSignature(EXPECTED_SIG, SECRET, tampered)).toBe(false);
  });

  it('returns false for a wrong secret', () => {
    expect(verifyWebhookSignature(EXPECTED_SIG, 'wrong-secret', PAYLOAD_JSON)).toBe(false);
  });

  it('returns false for a truncated signature', () => {
    expect(verifyWebhookSignature(EXPECTED_SIG.slice(0, 32), SECRET, PAYLOAD_JSON)).toBe(false);
  });

  it('returns false for an all-zero signature', () => {
    expect(verifyWebhookSignature('0'.repeat(64), SECRET, PAYLOAD_JSON)).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifyWebhookSignature('', SECRET, PAYLOAD_JSON)).toBe(false);
  });

  it('returns false for a non-hex signature string', () => {
    expect(verifyWebhookSignature('not-hex-at-all', SECRET, PAYLOAD_JSON)).toBe(false);
  });

  it('is timing-safe (does not throw on length mismatch)', () => {
    expect(() => verifyWebhookSignature('short', SECRET, PAYLOAD_JSON)).not.toThrow();
  });
});

// ── constructEvent ────────────────────────────────────────────────────────────

describe('constructEvent', () => {
  it('returns the parsed event for a valid signature + payload', () => {
    const event = constructEvent(PAYLOAD_JSON, EXPECTED_SIG, SECRET);
    expect(event.id).toBe('evt_01HXK3Z7BQMR4NTHPWG9Y2F5JD');
    expect(event.type).toBe('campaign.created');
    expect(event.data.campaignId).toBe('camp_abc123');
  });

  it('throws with a descriptive message when the signature is invalid', () => {
    expect(() =>
      constructEvent(PAYLOAD_JSON, 'bad-signature', SECRET),
    ).toThrow('Trivela webhook signature verification failed');
  });

  it('throws when the secret is wrong', () => {
    expect(() =>
      constructEvent(PAYLOAD_JSON, EXPECTED_SIG, 'wrong-secret'),
    ).toThrow('Trivela webhook signature verification failed');
  });

  it('throws when the payload has been tampered with', () => {
    const tampered = PAYLOAD_JSON.replace('Summer Rewards', 'Hacked');
    expect(() =>
      constructEvent(tampered, EXPECTED_SIG, SECRET),
    ).toThrow('Trivela webhook signature verification failed');
  });

  it('returns a fully-parsed JavaScript object (not a string)', () => {
    const event = constructEvent(PAYLOAD_JSON, EXPECTED_SIG, SECRET);
    expect(typeof event).toBe('object');
    expect(event).not.toBeNull();
  });

  it('round-trips any valid JSON event body', () => {
    const body = JSON.stringify({ id: 'x', type: 'campaign.deactivated', timestamp: 't', data: null });
    const sig = generateSignature(SECRET, body);
    const event = constructEvent(body, sig, SECRET);
    expect(event.type).toBe('campaign.deactivated');
  });
});

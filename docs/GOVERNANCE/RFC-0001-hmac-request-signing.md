# RFC-0001: HMAC Request Signing for Partner / Admin Routes

| Field      | Value          |
| ---------- | -------------- |
| RFC Number | 0001           |
| Author(s)  | @Williams-1604 |
| Status     | Accepted       |
| Created    | 2026-07-01     |
| Updated    | 2026-07-29     |

## Summary

Add an optional HMAC-SHA256 request-signing layer for partner-to-server and admin API calls. Signed
requests include a timestamp and a nonce; the server rejects stale or replayed requests, providing a
second authentication factor beyond API keys.

## Motivation

High-value integrators (payment processors, enterprise partners) require stronger server-to-server
identity guarantees than a static API key provides. A compromised key in transit can be replayed
indefinitely without signing. Mutual TLS is the gold standard but adds significant infrastructure
overhead; HMAC signing closes the replay-attack gap with zero new infrastructure.

## Detailed Design

### Signature Scheme

Every signed request must include three headers:

```
X-Trivela-Timestamp: <Unix epoch seconds>
X-Trivela-Nonce:     <random UUID or comparable entropy string>
X-Trivela-Signature: hmac-sha256=<lowercase hex>
```

The signed material is:

```
<timestamp>.<nonce>.<rawBodyHex>
```

where `rawBodyHex` is the hex encoding of the raw UTF-8 request body (empty string for GET/DELETE
requests with no body).

The HMAC key is `PARTNER_HMAC_SECRET` from the environment (≥ 32 bytes recommended).

### Replay Protection

- Requests whose timestamp is more than ±5 minutes from server time are rejected with 401.
- Each nonce is stored in an in-memory `Map` (or Redis for multi-instance) for 10 minutes. A nonce
  seen twice → 401.

### Middleware

`backend/src/middleware/hmacSignature.js` exports `createHmacSignatureMiddleware(opts)`. Apply it to
any route group that requires signed requests:

```js
import { createHmacSignatureMiddleware } from './middleware/hmacSignature.js';
router.use(createHmacSignatureMiddleware());
```

### Client-Side Signing (Example)

```js
import { createHmac } from 'node:crypto';

function signRequest(method, body, secret) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const rawBodyHex = Buffer.from(body ?? '').toString('hex');
  const material = `${timestamp}.${nonce}.${rawBodyHex}`;
  const sig = createHmac('sha256', secret).update(material).digest('hex');
  return {
    'X-Trivela-Timestamp': timestamp,
    'X-Trivela-Nonce': nonce,
    'X-Trivela-Signature': `hmac-sha256=${sig}`,
  };
}
```

### Key Rotation

1. Generate a new secret (≥ 32 random bytes, base64-encoded).
2. Deploy with both old and new secrets accepted (dual-verify period ≥ 1 hour).
3. Communicate the new key to partners via secure channel.
4. Remove the old secret after all partners have rotated.

## Alternatives Considered

- **Mutual TLS** — stronger identity guarantees but requires certificate infrastructure per partner.
  Deferred to a future RFC when demand justifies the operational cost.
- **HMAC with request path in signed material** — adds replay protection across endpoints but
  complicates client implementation. Omitted for now; can be added in RFC-0003.

## Drawbacks

- In-memory nonce store is node-process-local; multi-instance deployments need Redis (documented as
  a migration path).
- Signature computation adds ~1 ms per request (negligible).

## Acceptance Criteria

- [x] `hmacSignature.js` middleware implemented and tested
- [x] 9 tests: valid sig → pass, stale ts, future ts, replay, wrong sig, missing headers
- [x] RFC documented in `RFC_INDEX.md`

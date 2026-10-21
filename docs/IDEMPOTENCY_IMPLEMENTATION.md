# Idempotency Keys Implementation

## Executive Summary

This document describes the implementation of idempotency keys for Trivela's write endpoints, ensuring exactly-once semantics for operations that trigger on-chain transactions or critical state changes. The system supports the `Idempotency-Key` header to prevent duplicate submissions from network retries or client-side errors.

## Background

### Problem
Network reliability issues and client-side errors can cause HTTP requests to be retried. Without idempotency protection:
- Credit operations could double-credit users
- Claim submissions could be processed multiple times
- Redemption requests could withdraw funds twice
- Campaign creations could result in duplicates

### Solution
Implement idempotency keys following industry best practices (Stripe, Twilio, AWS):
- Clients provide `Idempotency-Key` header with unique identifier
- Server stores key → result mapping with TTL
- Duplicate requests with same key return the original response
- Payload mismatches for reused keys return 422 error

## Architecture

### Components

1. **Middleware**: `backend/src/middleware/idempotency.js`
2. **Repository**: `backend/src/dal/idempotencyRepository.js`
3. **Database**: `idempotency_keys` table in SQLite
4. **Integration**: Applied to all POST/PUT/PATCH endpoints

### Data Model

```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  locked_at TEXT,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
```

### Fields
- **key**: Client-provided idempotency key (8-256 characters)
- **request_fingerprint**: SHA-256 hash of `method:url:body` for payload validation
- **status_code**: HTTP status of the original response
- **response_body**: JSON response from the original request
- **locked_at**: Timestamp when request started processing (prevents concurrent execution)
- **completed_at**: Timestamp when request finished
- **expires_at**: TTL expiration (default 24 hours)
- **created_at**: Record creation timestamp

## Implementation Details

### Middleware Flow

```javascript
export function createIdempotencyMiddleware({ repository, ttlMs = 24 * 60 * 60 * 1000 }) {
  return async function idempotency(req, res, next) {
    // 1. Skip non-mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    // 2. Check for Idempotency-Key header
    const key = req.headers['idempotency-key'];
    if (!key) return next(); // Optional: key not required

    // 3. Validate key format
    if (typeof key !== 'string' || key.length < 8 || key.length > 256) {
      return res.status(400).json({
        error: 'Invalid Idempotency-Key format (8-256 characters required)',
        code: 'INVALID_IDEMPOTENCY_KEY',
      });
    }

    // 4. Compute request fingerprint
    const fp = fingerprint(req); // SHA-256(method:url:body)

    // 5. Check for existing request
    const existing = repository.find(key);
    
    if (existing) {
      // 5a. Request already completed
      if (existing.completed_at) {
        // Check if expired
        const expired = new Date(existing.expires_at) < new Date();
        if (expired) {
          repository.cleanup();
          return next(); // Treat as new request
        }

        // Verify payload matches
        if (existing.request_fingerprint !== fp) {
          return res.status(422).json({
            error: 'Idempotency-Key reused with different request payload',
            code: 'IDEMPOTENCY_KEY_MISMATCH',
          });
        }

        // Return cached response
        res.setHeader('Idempotent-Previous-Request', 'true');
        return res.status(existing.status_code).json(JSON.parse(existing.response_body));
      }

      // 5b. Request in progress
      if (existing.locked_at) {
        return res.status(409).json({
          error: 'Request already in progress',
          code: 'IDEMPOTENCY_IN_PROGRESS',
        });
      }
    }

    // 6. Create new idempotency record
    if (!existing) {
      repository.create(key, fp);
    }

    // 7. Lock the key to prevent concurrent processing
    const locked = repository.tryLock(key);
    if (!locked) {
      return res.status(409).json({
        error: 'Request already in progress',
        code: 'IDEMPOTENCY_IN_PROGRESS',
      });
    }

    // 8. Intercept response to cache result
    const originalJson = res.json.bind(res);
    res.json = function interceptJson(body) {
      const statusCode = res.statusCode || 200;
      try {
        repository.complete(key, statusCode, JSON.stringify(body));
      } catch (err) {
        req.log?.warn?.({ err }, 'Failed to persist idempotency response');
      }
      return originalJson(body);
    };

    next(); // Proceed to route handler
  };
}
```

### Request Fingerprinting

To detect payload mismatches when keys are reused:

```javascript
function fingerprint(req) {
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  return createHash('sha256').update(`${req.method}:${req.originalUrl}:${body}`).digest('hex');
}
```

**Why fingerprint?**
- Prevents accidental key reuse with different payloads
- Detects client-side bugs (e.g., UUID generator not working)
- Security: ensures integrity of idempotent operations

### TTL and Cleanup

**Default TTL**: 24 hours (configurable via `ttlMs`)

**Cleanup Strategy**:
- Lazy cleanup: when expired key encountered, trigger `repository.cleanup()`
- Periodic cleanup: background job removes all expired keys (recommended for production)

**Rationale**:
- 24 hours sufficient for retry scenarios
- Allows clients to safely retry failed requests within reasonable window
- Balances storage costs vs. safety margin

## Endpoint Coverage

### Critical Endpoints with Idempotency Protection

All POST/PUT/PATCH endpoints are protected when the middleware is applied. Key endpoints include:

#### Campaign Management
- `POST /v1/campaigns` - Create new campaign
- `PUT /v1/campaigns/:id` - Update campaign
- `POST /v1/campaigns/:id/clone` - Clone campaign
- `PUT /v1/campaigns/:id/publish` - Publish campaign
- `PUT /v1/campaigns/:id/archive` - Archive campaign
- `POST /v1/campaigns/:id/restore` - Restore campaign

#### Claimable Balances (On-Chain Operations)
- `POST /campaigns/:id/claimable-balances` - **Critical**: Enqueue on-chain claimable balance creation
- `POST /campaigns/:id/claimable-balances/reclaim` - **Critical**: Reclaim unclaimed balances

#### Webhooks
- `POST /v1/webhooks` - Create webhook
- `PUT /v1/webhooks/:id` - Update webhook

#### Admin Operations
- `POST /v1/admin/moderation/blocklist` - Add to blocklist
- `PUT /v1/admin/usage/quotas` - Update usage quotas

### Integration Points

```javascript
// backend/src/index.js

// 1. Import middleware
import { createIdempotencyMiddleware } from './middleware/idempotency.js';

// 2. Initialize with repository
const idempotencyRepository = dal.idempotency;
const idempotencyMiddleware = createIdempotencyMiddleware({
  repository: idempotencyRepository,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
});

// 3. Apply to routes
app.post(
  `${prefix}/campaigns`,
  rateLimiter,
  idempotencyMiddleware, // Idempotency protection
  ...guard,
  requireScope('campaigns:write'),
  createCampaign,
);

app.post(
  '/campaigns/:id/claimable-balances',
  idempotencyMiddleware, // Prevents duplicate on-chain operations
  (req, res) => {
    // Enqueue job for claimable balance creation
    jobQueue.enqueue(CLAIMABLE_BALANCES_JOB_TYPE, payload);
    return res.status(202).json({ ok: true, jobId });
  },
);
```

## Client Usage

### Basic Usage

```javascript
import { v4 as uuidv4 } from 'uuid';

// Generate unique key for this request
const idempotencyKey = uuidv4();

const response = await fetch('https://api.trivela.io/v1/campaigns', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Idempotency-Key': idempotencyKey, // Add idempotency key
  },
  body: JSON.stringify({
    name: 'Summer Campaign 2026',
    startDate: '2026-06-01',
    endDate: '2026-08-31',
  }),
});
```

### Safe Retry Pattern

```javascript
async function createCampaignWithRetry(campaignData) {
  const idempotencyKey = uuidv4(); // Generate once, reuse on retries
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.trivela.io/v1/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey, // Same key on all retries
        },
        body: JSON.stringify(campaignData),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Check if this was a duplicate request
        if (response.headers.get('Idempotent-Previous-Request') === 'true') {
          console.log('Request was idempotent (duplicate detected)');
        }
        
        return data;
      }

      if (response.status === 422) {
        // Payload mismatch - don't retry
        throw new Error('Idempotency key reused with different payload');
      }

      if (response.status === 409) {
        // Request in progress - wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }

      // Other errors
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
```

## Error Handling

### Status Codes

| Status | Code | Description | Action |
|--------|------|-------------|--------|
| 400 | `INVALID_IDEMPOTENCY_KEY` | Key format invalid (must be 8-256 chars) | Fix key format |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | Request with this key is currently processing | Wait and retry |
| 422 | `IDEMPOTENCY_KEY_MISMATCH` | Key reused with different payload | Use new key or fix payload |

### Example Error Responses

```json
{
  "error": "Invalid Idempotency-Key format (8-256 characters required)",
  "code": "INVALID_IDEMPOTENCY_KEY"
}
```

```json
{
  "error": "Request already in progress",
  "code": "IDEMPOTENCY_IN_PROGRESS"
}
```

```json
{
  "error": "Idempotency-Key reused with different request payload",
  "code": "IDEMPOTENCY_KEY_MISMATCH"
}
```

## Testing

### Integration Tests

Location: `backend/src/middleware/idempotency.test.js`

Key test scenarios:
1. **First request**: Creates record and processes normally
2. **Duplicate request**: Returns cached response with `Idempotent-Previous-Request: true`
3. **Payload mismatch**: Returns 422 error
4. **Concurrent requests**: One proceeds, others get 409
5. **Expired key**: Allows new request after TTL
6. **Invalid key format**: Returns 400 error

### Running Tests

```bash
# Run all idempotency tests
npm test -- idempotency

# Run with coverage
npm run test:coverage -- idempotency
```

### Manual Testing

```bash
# Generate idempotency key
KEY=$(uuidv4)

# First request
curl -X POST https://api.trivela.io/v1/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $KEY" \
  -d '{"name": "Test Campaign", "startDate": "2026-09-01"}'

# Duplicate request (should return cached response)
curl -X POST https://api.trivela.io/v1/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $KEY" \
  -d '{"name": "Test Campaign", "startDate": "2026-09-01"}' \
  -i  # Check for Idempotent-Previous-Request header

# Payload mismatch (should return 422)
curl -X POST https://api.trivela.io/v1/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $KEY" \
  -d '{"name": "Different Campaign", "startDate": "2026-10-01"}'
```

## Monitoring and Observability

### Metrics

Track the following metrics:

1. **Idempotency hit rate**: `idempotent_requests_total / total_requests`
2. **Key reuse errors**: Count of 422 responses (IDEMPOTENCY_KEY_MISMATCH)
3. **Concurrent conflicts**: Count of 409 responses (IDEMPOTENCY_IN_PROGRESS)
4. **Storage size**: Number of keys in `idempotency_keys` table
5. **Cleanup frequency**: Rate of expired key removal

### Logging

```javascript
// Log idempotency cache hits
if (existing && existing.completed_at) {
  req.log.info({
    idempotencyKey: key,
    cached: true,
    statusCode: existing.status_code,
  }, 'Returning cached idempotent response');
}

// Log payload mismatches (potential client bugs)
if (existing.request_fingerprint !== fp) {
  req.log.warn({
    idempotencyKey: key,
    existingFingerprint: existing.request_fingerprint,
    newFingerprint: fp,
  }, 'Idempotency key reused with different payload');
}
```

## Security Considerations

### Key Generation
- **Client Responsibility**: Clients must generate cryptographically random keys
- **Recommended**: UUIDv4, random hex strings (≥16 chars), or client-side timestamps + nonce
- **Avoid**: Sequential integers, predictable patterns

### Key Scope
- Keys are global across all users for a given endpoint
- Different users with the same key will share idempotency state
- **Recommendation**: Include user ID in key generation for multi-tenant safety:
  ```javascript
  const idempotencyKey = `${userId}-${uuidv4()}`;
  ```

### Payload Fingerprinting
- **Defense against**: Accidental key reuse
- **Attack scenario**: Malicious client reuses key with different payload
- **Mitigation**: 422 error prevents processing

### Storage Security
- Idempotency records may contain sensitive response data
- **Recommendation**: Encrypt `response_body` column in production
- **Alternative**: Store only success/failure flag, require clients to re-fetch full response

## Performance Considerations

### Database Queries
Each idempotent request performs:
1. SELECT (check existing key)
2. INSERT (create new record) or UPDATE (lock/complete)

**Optimization**:
- Index on `key` (PRIMARY KEY) ensures O(1) lookup
- Index on `expires_at` speeds up cleanup

### Memory Overhead
- Minimal: only metadata stored per request
- Response body stored as JSON text (consider compression for large responses)

### Cleanup Performance
- Background job runs every 1 hour (configurable)
- Deletes all keys with `expires_at < NOW()`
- Uses index for efficient deletion

```sql
DELETE FROM idempotency_keys WHERE expires_at < datetime('now');
```

## Future Enhancements

### Considered for Future Releases

1. **Distributed Locking**: Use Redis for multi-instance deployments
2. **Response Streaming**: Support streaming responses with idempotency
3. **Partial Response Caching**: Cache only successful responses
4. **Scoped Keys**: Automatically scope keys by user/tenant
5. **Key Namespace**: Support hierarchical key namespaces (e.g., `org:user:operation:uuid`)

## References

- [RFC 5789 - HTTP PATCH Method](https://tools.ietf.org/html/rfc5789)
- [Stripe Idempotency Guide](https://stripe.com/docs/api/idempotent_requests)
- [AWS API Gateway Idempotency](https://aws.amazon.com/blogs/compute/making-retries-safe-with-idempotent-apis/)
- [Designing Idempotent Operations](https://particular.net/blog/what-does-idempotent-mean)

---

**Document Version**: 1.0  
**Last Updated**: August 2026  
**Review Date**: February 2027  
**Owner**: Trivela Backend Team  
**Related Issue**: #860

# API Migration Guide: v0 → v1

> **Status:** Current API version is `0.1.0`. The v1 upgrade tracks
> [issue #32](https://github.com/FinesseStudioLab/Trivela/issues/32).
>
> This document helps integrators migrate from the legacy `/api/*` routes to the versioned
> `/api/v1/*` API. Breaking changes and deprecation timelines are documented here.

---

## Table of Contents

- [v0 → v1 Changes](#v0--v1-changes)
- [Endpoint Changelog](#endpoint-changelog)
- [Breaking Change Policy](#breaking-change-policy)
- [Migration Examples](#migration-examples)
- [Compatibility Shim (`?api_version=v0`)](#compatibility-shim-apiversionv0)

---

## v0 → v1 Changes

### Route Prefix

| Version | Prefix    | Example                 |
| ------- | --------- | ----------------------- |
| v0      | `/api`    | `GET /api/campaigns`    |
| v1      | `/api/v1` | `GET /api/v1/campaigns` |

Legacy `/api/*` routes are still supported for backward compatibility but will be removed after the
90-day deprecation window (see [Breaking Change Policy](#breaking-change-policy)).

### Renamed Fields

The following fields have been renamed in API responses. Old names will be removed in v1.

| Endpoint                    | v0 Field                     | v1 Field                          | Notes                                                                 |
| --------------------------- | ---------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `GET /api/v1`               | `rpcUrl`                     | `sorobanRpcUrl`                   | Reflects that this is a Soroban RPC URL                               |
| `GET /api/v1/config`        | `rpcUrl`                     | `sorobanRpcUrl`                   | Consistent naming across endpoints                                    |
| `GET /api/v1/campaigns/:id` | `campaignId` (in stats)      | `campaignId` → stays `campaignId` | No change, but verify your integration reads `id` for the campaign ID |
| All                         | `timestamp` (event payloads) | `createdAt` / `updatedAt`         | Context-dependent; timestamps now use descriptive field names         |
| `GET /health`               | `service` (string)           | `service` → stays `service`       | No change                                                             |
| `POST /api/v1/campaigns`    | `imageUrl` in request body   | `imageUrl` → stays `imageUrl`     | No change, but validation added                                       |

### Removed Endpoints

These endpoints available in v0 are **removed** in v1. Use the replacements listed:

| v0 (Removed)             | v1 Replacement                        | Reason                             |
| ------------------------ | ------------------------------------- | ---------------------------------- |
| `GET /api/health`        | `GET /api/v1/health` (no /api prefix) | Health is outside versioned API    |
| `GET /api/health/rpc`    | `GET /api/v1/health/rpc`              | Same as above                      |
| `GET /api/metrics`       | `GET /api/v1/metrics`                 | Prometheus metrics are unversioned |
| `GET /api` (legacy info) | `GET /api/v1`                         | Use versioned info endpoint        |

### New Required Headers

v1 introduces these changes to request headers:

| Header                     | Required     | Description                                 |
| -------------------------- | ------------ | ------------------------------------------- |
| `X-Trivela-Schema-Version` | Optional     | Request a specific schema version           |
| `X-API-Key`                | On write ops | API key for write endpoints (if configured) |

### Response Changes

v1 responses include:

- **`X-Trivela-Schema-Version: 1`** header on all responses
- **Consistent error format:** `{ error, code, details? }` (replaces the older string-only error
  format)
- **Pagination shape:** Standard `{ data, pagination }` structure on all list endpoints
- **Rate limit headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`,
  `RateLimit-Policy`, `RateLimit`

---

## Endpoint Changelog

| Date       | Change Type | Endpoint                                             | Description                  |
| ---------- | ----------- | ---------------------------------------------------- | ---------------------------- |
| 2026-01-15 | Added       | `GET /api/v1`                                        | API information endpoint     |
| 2026-01-15 | Added       | `GET /api/v1/config`                                 | Public Stellar configuration |
| 2026-01-15 | Added       | `GET /api/v1/campaigns`                              | Paginated campaign list      |
| 2026-01-15 | Added       | `GET /api/v1/campaigns/:id`                          | Single campaign by ID        |
| 2026-01-15 | Added       | `POST /api/v1/campaigns`                             | Create campaign              |
| 2026-01-15 | Added       | `PUT /api/v1/campaigns/:id`                          | Update campaign              |
| 2026-01-15 | Added       | `DELETE /api/v1/campaigns/:id`                       | Delete campaign              |
| 2026-01-15 | Added       | `GET /api/v1/explorer`                               | Explorer links               |
| 2026-03-01 | Added       | `GET /api/v1/campaigns/by-slug/:slug`                | Lookup by slug               |
| 2026-03-01 | Added       | `GET /api/v1/campaigns/:id/stats`                    | Campaign analytics           |
| 2026-03-01 | Added       | `GET /api/v1/categories`                             | Category list                |
| 2026-03-01 | Added       | `GET /api/v1/tags`                                   | Tag list                     |
| 2026-03-01 | Added       | `GET /api/v1/indexer/cursor`                         | Indexer cursor state         |
| 2026-03-15 | Added       | `GET /api/v1/audit-logs`                             | Audit log queries            |
| 2026-03-15 | Added       | `GET /api/v1/admin/api-keys`                         | API key management           |
| 2026-03-15 | Added       | `POST /api/v1/admin/api-keys`                        | Create API key               |
| 2026-03-15 | Added       | `DELETE /api/v1/admin/api-keys/:id`                  | Revoke API key               |
| 2026-03-15 | Added       | `PUT /api/v1/admin/api-keys/:id/rotate`              | Rotate API key               |
| 2026-04-01 | Added       | `POST /api/v1/campaigns/:id/image`                   | Campaign image upload        |
| 2026-04-01 | Added       | `POST /api/v1/campaigns/:id/referrals`               | Create referral              |
| 2026-04-01 | Added       | `GET /api/v1/campaigns/:id/referrals/:walletAddress` | Referral stats               |

### Change Type Legend

- **Added** — New endpoint; no breaking impact on existing integrators
- **Changed** — Existing endpoint behaviour modified; migrate before the old behaviour is removed
- **Removed** — Endpoint no longer available; use the replacement
- **Deprecated** — Endpoint still works but will be removed in a future release

---

## Breaking Change Policy

Trivela follows a **predictable breaking change policy** to minimise disruption for integrators.

### 90-Day Deprecation Notice

| Phase         | Duration   | Description                                                                                                                                       |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Announcement  | Day 0      | Breaking change announced on the [API changelog](#endpoint-changelog) and [GitHub Releases](https://github.com/FinesseStudioLab/Trivela/releases) |
| Deprecation   | Days 0–60  | Old behaviour still works; `Deprecation` response header added                                                                                    |
| Sunset header | Days 60–90 | `Sunset` header added with the removal date                                                                                                       |
| Removal       | Day 90+    | Old behaviour removed; requests return `410 Gone` or `404 Not Found`                                                                              |

### Sunset Header

30 days before a breaking change takes effect, affected responses include:

```http
Sunset: Sat, 01 Jul 2026 00:00:00 GMT
Deprecation: true
```

Integrators should monitor these headers and update their code before the sunset date.

### Exceptions

- **Security fixes** may be applied immediately without a deprecation period
- **Internal-only endpoints** (no documented public contract) may change without notice
- **Pre-release endpoints** (marked with `x-` prefix) may change without notice

---

## Migration Examples

### 1. Route prefix migration

**Before (v0):**

```bash
# Legacy campaigns list
curl http://localhost:3001/api/campaigns

# Legacy campaign detail
curl http://localhost:3001/api/campaigns/campaign-1

# Legacy API info
curl http://localhost:3001/api
```

**After (v1):**

```bash
# Versioned campaigns list
curl http://localhost:3001/api/v1/campaigns

# Versioned campaign detail
curl http://localhost:3001/api/v1/campaigns/campaign-1

# Versioned API info
curl http://localhost:3001/api/v1
```

### 2. API key header

**Before (v0):**

```bash
curl -X POST http://localhost:3001/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{"name": "Campaign", "rewardPerAction": 10}'
```

**After (v1):**

```bash
curl -X POST http://localhost:3001/api/v1/campaigns \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_prod_abc123" \
  -d '{"name": "Campaign", "rewardPerAction": 10}'
```

### 3. Pagination response (new standard shape)

**Before (v0 — unstructured):**

```json
[
  {
    "id": "campaign-1",
    "name": "Welcome Campaign"
  }
]
```

**After (v1 — standard pagination envelope):**

```json
{
  "data": [
    {
      "id": "campaign-1",
      "name": "Welcome Campaign"
    }
  ],
  "pagination": {
    "total": 42,
    "count": 1,
    "page": 1,
    "limit": 10,
    "offset": 0,
    "totalPages": 42,
    "hasPreviousPage": false,
    "hasNextPage": true,
    "previousPage": null,
    "nextPage": 2
  }
}
```

### 4. Error response format

**Before (v0 — string-only errors):**

```json
{
  "error": "Campaign not found"
}
```

**After (v1 — structured errors):**

```json
{
  "error": "Campaign not found",
  "code": "CAMPAIGN_NOT_FOUND"
}
```

With validation errors:

```json
{
  "error": "Invalid campaign payload",
  "code": "VALIDATION_ERROR",
  "details": ["name is required and must be a non-empty string"]
}
```

### 5. Config endpoint field rename

**Before (v0):**

```bash
curl http://localhost:3001/api/config
# Response: { "rpcUrl": "https://..." }
```

**After (v1):**

```bash
curl http://localhost:3001/api/v1/config
# Response: { "sorobanRpcUrl": "https://..." }
```

### 6. Campaign create with tags and category

**Before (v0):**

```bash
curl -X POST http://localhost:3001/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Campaign",
    "rewardPerAction": 10
  }'
```

**After (v1):**

```bash
curl -X POST http://localhost:3001/api/v1/campaigns \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_prod_abc123" \
  -d '{
    "name": "Campaign",
    "rewardPerAction": 10,
    "tags": ["defi", "community"],
    "category": "DeFi"
  }'
```

---

## Compatibility Shim (`?api_version=v0`)

A **compatibility shim** is available during the 90-day migration window. Append `?api_version=v0`
to any v1 endpoint to request legacy route rewriting and response compatibility.

### How It Works

The shim intercepts requests to `/api/v1/*` when the `api_version=v0` query parameter is present:

1. **Route rewriting:** The `?api_version=v0` parameter triggers the server to apply legacy route
   patterns (matching `/api/*` behaviour)
2. **Deprecation header:** Responses include a `Deprecation: true` header to indicate the shim is
   temporary
3. **Response compatibility:** The response shape matches v0 format where differences exist

### Example

```bash
# Using the compat shim
curl "http://localhost:3001/api/v1/campaigns?api_version=v0"
# Response includes: Deprecation: true
```

### Important

- The shim is a **temporary bridge** — it will be removed after the 90-day deprecation window
- New integrators should target v1 directly without the shim
- The shim does NOT provide full backward compatibility for all edge cases — test your integration
  thoroughly
- After the 90-day window, `?api_version=v0` will be ignored and v1 behaviour will apply
  unconditionally

### Testing the Shim

```bash
# Verify the shim applies correct route rewriting
curl -s "http://localhost:3001/api/v1/campaigns?api_version=v0" \
  -H "X-API-Key: test-key" \
  | head -1

# Check for Deprecation header
curl -sI "http://localhost:3001/api/v1/campaigns?api_version=v0" \
  | grep -i deprecation
```

---

## Need Help?

- Open a [Discussion](https://github.com/FinesseStudioLab/Trivela/discussions) for migration
  questions
- Check the [FAQ](FAQ.md) for common issues
- Review the full [OpenAPI spec](../backend/openapi.yaml) for endpoint details

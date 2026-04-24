# Trivela Backend

REST API for the Trivela campaign and rewards platform. Handles campaign metadata, health checks, and Soroban RPC configuration for the frontend.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment

- `PORT`: Server port (default `3001`)
- `CORS_ALLOWED_ORIGINS`: Comma-separated allowed origins for CORS (example: `https://app.example.com,https://admin.example.com`)
- `CORS_ORIGIN`: Legacy single-origin CORS setting (fallback when `CORS_ALLOWED_ORIGINS` is not set)
- `STELLAR_NETWORK`: `testnet` or `mainnet`
- `SOROBAN_RPC_URL`: Soroban RPC URL exposed in API metadata
- `REWARDS_CONTRACT_ID`: Optional rewards contract ID exposed by `/api/v1/config`
- `CAMPAIGN_CONTRACT_ID`: Optional campaign contract ID exposed by `/api/v1/config`
- `TRIVELA_API_KEY`: Optional API key for write endpoints (see below)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window for `/api/*` and `/api/v1/*` routes (default `60000`)
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per API key or IP in each window (default `60`)

## API Key Authentication

Write endpoints (`POST`, `PUT`, `DELETE`) are protected by an **optional** API
key. The behaviour depends on whether `TRIVELA_API_KEY` is set:

| `TRIVELA_API_KEY`     | Behaviour                                                            |
| --------------------- | -------------------------------------------------------------------- |
| **Not set** (default) | All endpoints are open — convenient for local development.           |
| **Set to a value**    | Write endpoints require the key. Read endpoints (`GET`) remain open. |

### Supplying the key

Include it in one of two ways:

```
# Header (recommended)
X-API-Key: <your-key>

# Query parameter
GET /api/v1/campaigns?api_key=<your-key>
```

If the key is missing or wrong the API responds with `401 Unauthorized`.

## Rate limiting

All `/api/*` and `/api/v1/*` routes are protected by an in-memory rate limiter.
Requests are keyed by API key when one is present, otherwise by client IP.
When the limit is exceeded the API returns `429 Too Many Requests` with a
`Retry-After` header.

**Example (rate limit exceeded):**

```bash
curl http://localhost:3001/api/v1/campaigns
# HTTP/1.1 429 Too Many Requests
# Retry-After: 45
# {
#   "error": "Too many requests"
# }
```

## Backward Compatibility

Legacy routes remain available under `/api/*` for backward compatibility:

- `GET /api`
- `GET /api/config`
- `GET /api/campaigns`
- `GET /api/campaigns/:id`
- `DELETE /api/campaigns/:id`

**Migration note:** New integrations should use `/api/v1/*`. Existing clients on `/api/*` continue to work.

## API Endpoints

### Health & Monitoring

#### GET /health

Check API and Soroban RPC health.

**Response (200 OK):**

```json
{
  "status": "ok",
  "service": "trivela-api",
  "timestamp": "2024-04-24T10:30:00.000Z",
  "rpc": {
    "status": "ok",
    "latency_ms": 45
  }
}
```

**Example:**

```bash
curl http://localhost:3001/health
```

#### GET /health/rpc

Direct Soroban RPC health check.

**Response (200 OK):**

```json
{
  "status": "ok",
  "latency_ms": 45
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "error",
  "error": "RPC unreachable"
}
```

**Example:**

```bash
curl http://localhost:3001/health/rpc
```

#### GET /metrics

Prometheus-format metrics for monitoring.

**Response (200 OK):**

```
# HELP trivela_requests_total Total HTTP requests handled.
# TYPE trivela_requests_total counter
trivela_requests_total 1234
# HELP trivela_request_errors_total Total HTTP requests with status >= 400.
# TYPE trivela_request_errors_total counter
trivela_request_errors_total 12
# HELP trivela_process_uptime_seconds Node.js process uptime.
# TYPE trivela_process_uptime_seconds gauge
trivela_process_uptime_seconds 3600.123
# HELP trivela_route_hits_total Route-level request counts.
# TYPE trivela_route_hits_total counter
trivela_route_hits_total{route="GET /api/v1/campaigns"} 456
trivela_route_hits_total{route="POST /api/v1/campaigns"} 12
```

**Example:**

```bash
curl http://localhost:3001/metrics
```

### API Info

#### GET /api/v1

Get API information and available endpoints.

**Response (200 OK):**

```json
{
  "name": "Trivela API",
  "version": "0.1.0",
  "prefix": "/api/v1",
  "endpoints": {
    "health": "GET /health",
    "healthRpc": "GET /health/rpc",
    "metrics": "GET /metrics",
    "info": "GET /api/v1",
    "campaigns": "GET /api/v1/campaigns",
    "campaign": "GET /api/v1/campaigns/:id",
    "createCampaign": "POST /api/v1/campaigns",
    "updateCampaign": "PUT /api/v1/campaigns/:id",
    "deleteCampaign": "DELETE /api/v1/campaigns/:id",
    "config": "GET /api/v1/config"
  },
  "stellar": {
    "network": "testnet",
    "rpcUrl": "https://soroban-testnet.stellar.org"
  }
}
```

**Example:**

```bash
curl http://localhost:3001/api/v1
```

#### GET /api/v1/config

Get public configuration (network, RPC URL, contract IDs).

**Response (200 OK):**

```json
{
  "stellar": {
    "network": "testnet",
    "networkPassphrase": "Test SDF Network ; September 2015",
    "rpcUrl": "https://soroban-testnet.stellar.org"
  },
  "contracts": {
    "rewards": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    "campaign": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4"
  }
}
```

**Example:**

```bash
curl http://localhost:3001/api/v1/config
```

### Campaigns

#### GET /api/v1/campaigns

List all campaigns with pagination.

**Query Parameters:**

- `page` (optional, default: 1) – Page number (1-indexed)
- `limit` (optional, default: 10) – Items per page
- `offset` (optional) – Alternative to page; skip this many items
- `api_key` (optional) – API key as query parameter (alternative to header)

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "campaign-1",
      "name": "Welcome Campaign",
      "description": "Earn points for completing onboarding",
      "active": true,
      "rewardPerAction": 10,
      "createdAt": "2024-04-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 42,
    "count": 10,
    "page": 1,
    "limit": 10,
    "offset": 0,
    "totalPages": 5,
    "hasPreviousPage": false,
    "hasNextPage": true,
    "previousPage": null,
    "nextPage": 2
  }
}
```

**Examples:**

```bash
# Page-based pagination
curl http://localhost:3001/api/v1/campaigns?page=1&limit=10

# Offset-based pagination
curl http://localhost:3001/api/v1/campaigns?offset=20&limit=10

# With API key
curl http://localhost:3001/api/v1/campaigns \
  -H "X-API-Key: sk_prod_abc123"
```

#### GET /api/v1/campaigns/:id

Get a single campaign by ID.

**Response (200 OK):**

```json
{
  "id": "campaign-1",
  "name": "Welcome Campaign",
  "description": "Earn points for completing onboarding",
  "active": true,
  "rewardPerAction": 10,
  "createdAt": "2024-04-01T00:00:00.000Z"
}
```

**Response (404 Not Found):**

```json
{
  "error": "Campaign not found"
}
```

**Examples:**

```bash
curl http://localhost:3001/api/v1/campaigns/campaign-1
```

#### POST /api/v1/campaigns

Create a new campaign. Requires API key if `TRIVELA_API_KEY` is set.

**Request Body:**

```json
{
  "name": "Summer Rewards",
  "description": "Earn points throughout summer",
  "rewardPerAction": 25,
  "active": true
}
```

**Response (201 Created):**

```json
{
  "id": "campaign-2",
  "name": "Summer Rewards",
  "description": "Earn points throughout summer",
  "active": true,
  "rewardPerAction": 25,
  "createdAt": "2024-04-24T10:30:00.000Z"
}
```

**Response (400 Bad Request):**

```json
{
  "errors": [
    "name is required and must be a non-empty string",
    "rewardPerAction is required and must be a non-negative number"
  ]
}
```

**Response (401 Unauthorized):**

```json
{
  "error": "Unauthorized"
}
```

**Validation Rules:**

- `name` – Required, non-empty string
- `rewardPerAction` – Required, non-negative number
- `description` – Optional, string
- `active` – Optional, boolean (default: false)

**Examples:**

```bash
# Without API key (if not configured)
curl -X POST http://localhost:3001/api/v1/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Summer Rewards",
    "description": "Earn points throughout summer",
    "rewardPerAction": 25,
    "active": true
  }'

# With API key (header)
curl -X POST http://localhost:3001/api/v1/campaigns \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_prod_abc123" \
  -d '{
    "name": "Summer Rewards",
    "description": "Earn points throughout summer",
    "rewardPerAction": 25,
    "active": true
  }'

# With API key (query parameter)
curl -X POST "http://localhost:3001/api/v1/campaigns?api_key=sk_prod_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Summer Rewards",
    "description": "Earn points throughout summer",
    "rewardPerAction": 25,
    "active": true
  }'
```

#### PUT /api/v1/campaigns/:id

Update an existing campaign. Requires API key if `TRIVELA_API_KEY` is set.

**Request Body (all fields optional):**

```json
{
  "name": "Summer Rewards 2024",
  "description": "Updated description",
  "rewardPerAction": 30,
  "active": false
}
```

**Response (200 OK):**

```json
{
  "id": "campaign-2",
  "name": "Summer Rewards 2024",
  "description": "Updated description",
  "active": false,
  "rewardPerAction": 30,
  "createdAt": "2024-04-24T10:30:00.000Z"
}
```

**Response (404 Not Found):**

```json
{
  "error": "Campaign not found"
}
```

**Examples:**

```bash
# Update single field
curl -X PUT http://localhost:3001/api/v1/campaigns/campaign-2 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_prod_abc123" \
  -d '{
    "active": false
  }'

# Update multiple fields
curl -X PUT http://localhost:3001/api/v1/campaigns/campaign-2 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_prod_abc123" \
  -d '{
    "name": "Summer Rewards 2024",
    "rewardPerAction": 30
  }'
```

#### DELETE /api/v1/campaigns/:id

Delete a campaign. Requires API key if `TRIVELA_API_KEY` is set.

**Response (204 No Content):**

```
(empty body)
```

**Response (404 Not Found):**

```json
{
  "error": "Campaign not found"
}
```

**Examples:**

```bash
curl -X DELETE http://localhost:3001/api/v1/campaigns/campaign-2 \
  -H "X-API-Key: sk_prod_abc123"
```

## Campaign Payload Validation

`POST /api/v1/campaigns` and `PUT /api/v1/campaigns/:id` validate request bodies and return `400` with a list of errors when invalid.

Validation rules:

- `name` must be a non-empty string (`POST` required, `PUT` optional if omitted)
- `rewardPerAction` must be a non-negative number (`POST` required, `PUT` optional if omitted)
- `description` must be a string when provided
- `active` must be a boolean when provided

## Docker

Build image from repo root:

```bash
docker build -f backend/Dockerfile -t trivela-backend .
```

Run container (example):

```bash
docker run --rm -p 3001:3001 \
  -e PORT=3001 \
  -e STELLAR_NETWORK=testnet \
  -e SOROBAN_RPC_URL=https://soroban-testnet.stellar.org \
  -e CORS_ALLOWED_ORIGINS=http://localhost:5173 \
  -e TRIVELA_API_KEY=dev-secret \
  trivela-backend
```

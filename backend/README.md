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

| `TRIVELA_API_KEY` | Behaviour |
|---|---|
| **Not set** (default) | All endpoints are open — convenient for local development. |
| **Set to a value** | Write endpoints require the key. Read endpoints (`GET`) remain open. |

### Supplying the key

Include it in one of two ways:

```
# Header (recommended)
X-API-Key: <your-key>

# Query parameter
GET /api/v1/campaigns?api_key=<your-key>
```

If the key is missing or wrong the API responds with `401 Unauthorized`.

## API

Preferred routes:

- `GET /health`
- `GET /health/rpc`
- `GET /api/v1`
- `GET /api/v1/config`
- `GET /api/v1/campaigns`
- `GET /api/v1/campaigns/:id`
- `DELETE /api/v1/campaigns/:id`

`GET /health` now includes the configured Soroban RPC health in the JSON
response. `GET /health/rpc` performs the direct RPC dependency check and returns
`503` when the configured Soroban RPC is unavailable.

## Rate limiting

All `/api/*` and `/api/v1/*` routes are protected by an in-memory rate limiter.
Requests are keyed by API key when one is present, otherwise by client IP.
When the limit is exceeded the API returns `429 Too Many Requests` with a
`Retry-After` header.

### Campaign pagination

`GET /api/v1/campaigns` supports either `page`/`limit` or `offset`/`limit`.

Example:

```text
GET /api/v1/campaigns?page=2&limit=10
GET /api/v1/campaigns?offset=20&limit=10
```

Response shape:

```json
{
  "data": [],
  "pagination": {
    "total": 0,
    "count": 0,
    "page": 1,
    "limit": 10,
    "offset": 0,
    "totalPages": 0,
    "hasPreviousPage": false,
    "hasNextPage": false,
    "previousPage": null,
    "nextPage": null
  }
}
```

Backward-compatible legacy routes remain available under `/api/*` for now:

- `GET /api`
- `GET /api/config`
- `GET /api/campaigns`
- `GET /api/campaigns/:id`
- `DELETE /api/campaigns/:id`

Migration note: new integrations should use `/api/v1/*`. Existing clients on `/api/*` continue to work.

## Campaign payload validation

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

Or build using backend as context (recommended for isolation):

```bash
docker build -f backend/Dockerfile -t trivela-backend backend/
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

You can also use an env file:

```bash
docker run --rm -p 3001:3001 --env-file backend/.env \
  trivela-backend
```


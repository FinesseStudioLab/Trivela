# Trivela Backend

REST API for the Trivela campaign and rewards platform. Handles campaign metadata, health checks, and Soroban RPC configuration for the frontend.

## API Documentation

The complete API specification is available in [OpenAPI 3.1 format](./openapi.yaml). You can view it using:
- [Swagger Editor](https://editor.swagger.io/) - paste the spec content
- [Redoc](https://redocly.github.io/redoc/) - for a clean documentation view
- Any OpenAPI-compatible tool

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment

The backend validates configuration on startup and fails fast with clear messages when values are invalid.

- `PORT`: Server port (default `3001`)
- `CORS_ALLOWED_ORIGINS`: Comma-separated allowed origins for CORS (example: `https://app.example.com,https://admin.example.com`)
- `CORS_ORIGIN`: Legacy single-origin CORS setting (fallback when `CORS_ALLOWED_ORIGINS` is not set)
- `JSON_BODY_LIMIT`: Max JSON request body size (default `100kb`; rejects larger bodies with `413`)
- `STELLAR_NETWORK`: Explicit named network preset, `testnet` or `mainnet`
- `SOROBAN_RPC_URL`: Optional Soroban RPC override exposed in API metadata
- `HORIZON_URL`: Optional Horizon override exposed in API metadata
- `STELLAR_NETWORK_PASSPHRASE`: Optional passphrase override for the chosen network preset
- `REWARDS_CONTRACT_ID`: Optional rewards contract ID exposed by `/api/v1/config`
- `CAMPAIGN_CONTRACT_ID`: Optional campaign contract ID exposed by `/api/v1/config`
- `TRIVELA_API_KEYS`: Optional comma-separated API keys for write endpoints (supports rotation; see below)
- `TRIVELA_API_KEY`: Legacy single API key (still supported)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window for `/api/*` and `/api/v1/*` routes (default `60000`)
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per API key or IP in each window (default `60`)
- `RPC_HEALTH_POLL_INTERVAL_MS`: Background Soroban RPC health poll interval (default `60000`; set `0` to disable)

## API Key Authentication

Write endpoints (`POST`, `PUT`, `DELETE`) are protected by an **optional** API
key. The behaviour depends on whether `TRIVELA_API_KEYS`/`TRIVELA_API_KEY` is set:

| Config                                         | Behaviour                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| **No keys set** (default)                      | All endpoints are open — convenient for local development.           |
| `TRIVELA_API_KEYS=old,new` (comma-separated)   | Write endpoints accept any configured key (supports rotation).       |
| `TRIVELA_API_KEY=single` (legacy)              | Write endpoints accept the single configured key.                    |

### Supplying the key

Include it in one of these ways (headers preferred):

```
# Header (recommended)
X-API-Key: <your-key>

# Authorization header (also supported)
Authorization: Bearer <your-key>

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

## Response schema versioning

All responses include a schema version header:

```
X-Trivela-Schema-Version: 1
```

Clients may also send `X-Trivela-Schema-Version` on requests. When present and unsupported, the API responds with `400` and includes the supported version in both the response header and body.

**Schema stability:** Within a given schema version, responses aim to be backward compatible (additive changes are preferred; breaking changes require a new schema version).

## Security Defaults

The API sets baseline security headers on all responses (for example `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a restrictive `Content-Security-Policy`). `Strict-Transport-Security` is only applied when requests are served over HTTPS (or when `X-Forwarded-Proto: https` is present).

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

Get public configuration (network, passphrase, RPC URL, Horizon URL, contract IDs).

**Response (200 OK):**

```json
{
  "stellar": {
    "network": "testnet",
    "networkPassphrase": "Test SDF Network ; September 2015",
    "sorobanRpcUrl": "https://soroban-testnet.stellar.org",
    "horizonUrl": "https://horizon-testnet.stellar.org"
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
      "createdAt": "2024-04-01T00:00:00.000Z",
      "updatedAt": "2024-04-01T00:00:00.000Z"
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
  "createdAt": "2024-04-01T00:00:00.000Z",
  "updatedAt": "2024-04-01T00:00:00.000Z"
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

Create a new campaign. Requires API key if `TRIVELA_API_KEYS`/`TRIVELA_API_KEY` is set.

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
  "createdAt": "2024-04-24T10:30:00.000Z",
  "updatedAt": "2024-04-24T10:30:00.000Z"
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

Update an existing campaign. Requires API key if `TRIVELA_API_KEYS`/`TRIVELA_API_KEY` is set.

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
  "createdAt": "2024-04-24T10:30:00.000Z",
  "updatedAt": "2024-04-24T10:45:00.000Z"
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

Delete a campaign. Requires API key if `TRIVELA_API_KEYS`/`TRIVELA_API_KEY` is set.

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

## Audit Logs (Admin)

Write operations on campaigns emit audit log entries. Audit logs are retrievable via an admin-only endpoint.

#### GET /api/v1/audit-logs

Requires API key if `TRIVELA_API_KEY` is set.

**Query Parameters (optional):**

- `entity` – Filter by entity (example: `campaign`)
- `entityId` – Filter by entity id
- `action` – Filter by action (`create`, `update`, `delete`)
- `page`, `limit`, `offset` – Same pagination params as other list endpoints

## PostgreSQL (issue #284)

The backend ships with two repository implementations behind a single DAL
factory. `better-sqlite3` is the default, suitable for local dev and
single-instance deployments. For multi-instance and managed cloud setups
(Railway, Render, Fly.io, RDS), point the backend at PostgreSQL via
`DATABASE_URL`:

```bash
export DATABASE_URL=postgres://trivela:trivela@localhost:5432/trivela
npm run dev
```

When `DATABASE_URL` starts with `postgres://` or `postgresql://`:

- `dal.campaigns` and `dal.auditLogs` switch to the PG implementations.
- A connection pool is created lazily with `pg` (`pg.Pool`). Pool size is
  controlled by `PG_POOL_MAX` (default `10`).
- SQL migrations in [`src/dal/pg/migrations/`](src/dal/pg/migrations/) run on
  startup and are tracked in `_schema_migrations`.
- `dal.webhooks`, `dal.referrals`, and `dal.apiKeys` continue to use SQLite —
  porting them is a follow-up.

### Local dev with Docker

```bash
docker compose --profile postgres up postgres
# In another shell:
DATABASE_URL=postgres://trivela:trivela@localhost:5432/trivela npm run dev
```

### Running the PG integration tests

The unit-test target `npm test` skips the PG repository tests unless
`TEST_DATABASE_URL` is set so a clean checkout stays green. To run them
locally:

```bash
docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=trivela \
  --name trivela-pg postgres:16-alpine
TEST_DATABASE_URL=postgres://postgres:trivela@localhost:55432/postgres \
  node --test src/dal/pg/pgCampaignRepository.test.js
```

The CI workflow can mount the `postgres` profile in `compose.yaml` and
export `TEST_DATABASE_URL` to exercise the same path on every PR.

## Docker

The backend ships as a multi-stage Alpine image. The build stage compiles
native modules (`better-sqlite3`) against Node 20 headers; the runtime
stage contains only Node, the production `node_modules` tree, the
application source, and `dumb-init` for clean signal forwarding. The
container runs as the unprivileged `node` user (uid/gid `1000`).

### Build

The Dockerfile expects the build context to be the repo root because the
monorepo's `package-lock.json` lives there:

```bash
docker build -f backend/Dockerfile -t trivela-backend .
```

A `.dockerignore` at the repo root keeps the context small (excludes
`node_modules`, `target/`, `frontend/`, etc.).

### Run

Minimal example:

```bash
docker run --rm -p 3001:3001 \
  -e STELLAR_NETWORK=testnet \
  trivela-backend
```

Production-like example with all the common knobs:

```bash
docker run --rm -p 3001:3001 \
  -e PORT=3001 \
  -e STELLAR_NETWORK=testnet \
  -e SOROBAN_RPC_URL=https://soroban-testnet.stellar.org \
  -e HORIZON_URL=https://horizon-testnet.stellar.org \
  -e CORS_ALLOWED_ORIGINS=http://localhost:5173 \
  -e TRIVELA_API_KEYS=dev-secret \
  -e RATE_LIMIT_MAX_REQUESTS=120 \
  trivela-backend
```

See the [Environment](#environment) section above for the full list of
supported variables.

### Persistence

The container's filesystem is read-only for the application user except
for the working directory. SQLite data lives under `backend/src/db/` by
default; mount a volume there to persist data across container restarts:

```bash
docker run --rm -p 3001:3001 \
  -v trivela-db:/app/backend/src/db/data \
  -e STELLAR_NETWORK=testnet \
  trivela-backend
```

### Health

The image declares a `HEALTHCHECK` that polls `GET /health` every 30s.
Orchestrators (Compose, Kubernetes, ECS) can use the resulting status:

```bash
docker inspect --format '{{json .State.Health}}' <container-id>
```

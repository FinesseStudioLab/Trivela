# Feature Implementation Summary

This document describes the implementation of four backend features addressing issues #1253, #1265, #1266, and #1346.

## Features Implemented

### 1. JWT Authentication Service for Operator Portal (#1253)

**Files:**
- `backend/src/services/jwtAuthService.js` - Core JWT service with token creation, validation, and rotation
- `backend/src/routes/operatorPortal.js` - Express routes for login, refresh, logout, and profile endpoints
- `backend/src/services/jwtAuthService.test.js` - Comprehensive unit tests

**Features:**
- JWT token generation with HS256 algorithm
- Refresh token rotation support
- HTTP-only cookie-based refresh token storage
- Token expiration (15 min access, 7 day refresh)
- Middleware for protected routes
- Secure cookie configuration (httpOnly, sameSite=strict, secure in production)

**API Endpoints:**
```
POST /operator/login
  Body: { userId, orgId, scope? }
  Response: { accessToken }

POST /operator/refresh
  Cookies: refreshToken
  Response: { accessToken }

POST /operator/logout
  Response: { message }

GET /operator/profile (Protected)
  Headers: Authorization: Bearer <accessToken>
  Response: { userId, orgId, scope }
```

**Environment Variables:**
- `JWT_SECRET` - Required for operator portal authentication (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

---

### 2. OpenTelemetry Tracing Instrumentation (#1265)

**Status:** Already implemented and wired in `backend/src/tracing.js`

**Features:**
- HTTP and Express auto-instrumentation
- OTLP exporter integration (Jaeger/Zipkin compatible)
- W3C Trace Context propagation
- Span context across async boundaries
- Database, RPC, and job execution spans
- No-op mode when exporter not configured

**Environment Variables:**
- `OTEL_SERVICE_NAME` - Service name in traces (default: "trivela-backend")
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP/HTTP endpoint (e.g., http://jaeger:4318)
- `OTEL_EXPORTER_OTLP_HEADERS` - Optional auth headers (comma-separated key=value)
- `OTEL_TRACES_SAMPLER_ARG` - Sampling ratio 0..1 (default: 1.0)

**Helper Functions in `tracing.js`:**
- `withSpan(name, attributes, fn)` - Manual span creation
- `linkedSpan(traceparent, name, attributes, fn)` - Async boundary trace linking
- `extractTraceContext()` / `resumeTraceContext()` - Transactional outbox pattern support
- `spanDatabaseQuery()` - Span DB operations
- `spanStellarRpc()` - Span Stellar RPC calls
- `spanJobExecution()` - Span job execution

---

### 3. On-Chain Transaction Gas Cost Monitoring Worker (#1266)

**Files:**
- `backend/src/jobs/gasCostMonitoringJob.js` - Worker for recording and aggregating gas costs
- `backend/src/dal/gasCostRepository.js` - Data access layer (SQLite & PostgreSQL)
- `backend/src/db/migrations/035_gas_costs.js` - Database migration

**Features:**
- Record XLM gas costs for contract interactions
- USD cost calculation based on XLM price
- Per-contract aggregation (daily, weekly)
- Method-level cost breakdowns
- Tracing integration for observability

**Job Methods:**
```javascript
const job = createGasCostMonitoringJob({ rpcPool, gasCostRepository, logger });

// Record a single transaction's gas cost
await job.recordGasCost(txHash, contractId, method, gasCost, xlmPrice);

// Get aggregated metrics for a contract
const metrics = await job.getContractMetrics(contractId, days);

// Run periodic aggregation
const results = await job.runAggregation();
```

**Database Schema:**
```sql
CREATE TABLE gas_costs (
  id INTEGER PRIMARY KEY,
  tx_hash VARCHAR NOT NULL,
  contract_id VARCHAR NOT NULL,
  method VARCHAR NOT NULL,
  gas_cost DECIMAL(20,7) NOT NULL,
  xlm_price DECIMAL(20,8),
  usd_cost DECIMAL(20,8) NOT NULL,
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

---

### 4. Centralized Log Aggregation with Loki and Promtail (#1346)

**Files:**
- `backend/src/services/logAggregationService.js` - Loki integration service
- `docker-compose.loki.yml` - Docker Compose for Loki, Promtail, and Grafana
- `loki-config.yml` - Loki server configuration
- `promtail-config.yml` - Promtail scrape configuration

**Features:**
- Send structured logs to Loki
- Query logs from Loki
- Aggregation statistics
- Health checks
- Automatic request logging middleware
- Docker-based deployment stack

**Service Methods:**
```javascript
const logService = createLogAggregationService({ lokiEndpoint, serviceName, environment });

// Send a log to Loki
await logService.sendLog({ level, message, labels, fields });

// Query logs from Loki
const logs = await logService.queryLogs(query, limit);

// Get aggregation stats
const stats = await logService.getStats(service, range);

// Health check
const health = await logService.healthCheck();
```

**Middleware:**
Automatically logs all HTTP requests to Loki with method, path, status, and duration.

**Environment Variables:**
- `LOKI_ENDPOINT` - Loki HTTP endpoint (default: http://localhost:3100)
- `OTEL_SERVICE_NAME` - Service name for logs (default: trivela-backend)
- `NODE_ENV` - Environment label (default: development)

**Docker Stack:**
```bash
# Start log aggregation stack
docker-compose -f docker-compose.loki.yml up -d

# Access Grafana: http://localhost:3000 (admin/admin)
# Grafana -> Add Data Source -> Loki (http://loki:3100)
```

---

## Integration Points

### Startup (index.js)

1. **JWT Service Initialization:**
   ```javascript
   const jwtAuthService = jwtSecret ? createJwtAuthService(jwtSecret) : null;
   if (jwtAuthService) {
     createOperatorPortalRoutes(app, { jwtSecret });
   }
   ```

2. **Gas Cost Monitoring Job:**
   ```javascript
   const gasCostMonitoringJob = createGasCostMonitoringJob({
     rpcPool,
     gasCostRepository,
     logger: log,
   });
   ```

3. **Log Aggregation Service:**
   ```javascript
   const logAggregationService = createLogAggregationService({
     lokiEndpoint: process.env.LOKI_ENDPOINT,
     serviceName: process.env.OTEL_SERVICE_NAME,
     environment: process.env.NODE_ENV,
     logger: log,
   });
   app.use(createLogAggregationMiddleware(logAggregationService));
   ```

### Service Exposure:
- `app._jwtAuthService`
- `app._gasCostMonitoringJob`
- `app._logAggregationService`

---

## Usage Examples

### JWT Authentication Flow

```javascript
// 1. Client logs in
const loginRes = await fetch('http://localhost:3001/operator/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user123', orgId: 'org456' }),
  credentials: 'include', // for cookies
});
const { accessToken } = await loginRes.json();

// 2. Use access token for protected requests
const profileRes = await fetch('http://localhost:3001/operator/profile', {
  headers: { Authorization: `Bearer ${accessToken}` },
});

// 3. Refresh token automatically (before expiry)
const refreshRes = await fetch('http://localhost:3001/operator/refresh', {
  method: 'POST',
  credentials: 'include',
});
const { accessToken: newToken } = await refreshRes.json();

// 4. Logout
await fetch('http://localhost:3001/operator/logout', {
  method: 'POST',
  credentials: 'include',
});
```

### Gas Cost Monitoring

```javascript
// Record a transaction's gas cost
await app._gasCostMonitoringJob.recordGasCost(
  '0x123abc',
  'CAAA',
  'invoke',
  100000000,
  0.12
);

// Get metrics
const metrics = await app._gasCostMonitoringJob.getContractMetrics('CAAA', 7);
console.log(metrics);
// {
//   contractId: 'CAAA',
//   totalGasCost: 100000000,
//   totalUsdCost: 12.00,
//   avgGasCost: 100000000,
//   transactionCount: 1,
//   methodBreakdown: { invoke: { count: 1, totalGas: 100000000, totalUsd: 12.00 } }
// }
```

### Log Aggregation Query

```javascript
// Query logs via Grafana or API
const logs = await app._logAggregationService.queryLogs(
  '{service="trivela-backend", level="error"}'
);

// Get stats
const stats = await app._logAggregationService.getStats('trivela-backend', '24h');
```

---

## Testing

### Run JWT Service Tests
```bash
cd backend
npm test -- src/services/jwtAuthService.test.js
```

### Verify Compilation
```bash
node -e "import('./src/services/jwtAuthService.js')"
```

---

## Migration Steps

1. **Database Migration:**
   ```bash
   npm run db:migrate
   # Runs all migrations including 035_gas_costs.js
   ```

2. **Environment Setup:**
   ```bash
   # .env
   JWT_SECRET=<generate-with-crypto>
   LOKI_ENDPOINT=http://localhost:3100
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   ```

3. **Start Services:**
   ```bash
   # Log aggregation stack (optional)
   docker-compose -f docker-compose.loki.yml up -d

   # Trivela backend
   npm run dev
   ```

---

## Minimal Implementation Notes

Each feature is implemented with **minimum viable functionality**:

- **JWT Service**: Core token operations without advanced features (no JTI revocation lists, no asymmetric keys)
- **Gas Monitoring**: Simple record and aggregate without real-time stream processing
- **Log Aggregation**: Fire-and-forget push to Loki without retry logic or batching
- **Tracing**: Already implemented, just integrated into startup

All implementations follow existing code patterns in the Trivela codebase and integrate seamlessly with the current architecture.

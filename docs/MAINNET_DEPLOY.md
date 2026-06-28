# Mainnet Deployment Guide

This guide walks through deploying Trivela to Stellar mainnet. Work through each section in order
and check off every item before proceeding to the next.

---

## 1. Pre-flight

### 1.1 Contract tests

```bash
cargo test --workspace
```

All tests must pass. Fix any failures before continuing.

### 1.2 Binding sync

Confirm that the generated TypeScript bindings match the compiled WASM. If `check-drift` exits
non-zero the bindings are stale — regenerate them and commit before deploying.

```bash
npm run codegen:check
```

### 1.3 Dependency audit

```bash
cargo audit
npm audit --audit-level=high
```

Resolve or justify every high/critical finding. A clean `cargo audit` output is required.

### 1.4 No hardcoded testnet references

```bash
grep -r "testnet" frontend/src --include="*.ts" --include="*.tsx" -l
grep -r "soroban-testnet\|horizon-testnet" backend/src --include="*.js" -l
```

All network references must come from environment variables.

---

## 2. Wallet Setup

### 2.1 Generate a dedicated admin keypair

The admin keypair controls `propose_admin`, `accept_admin`, and other privileged contract calls.
**Use a hardware wallet** (Ledger, Trezor) for mainnet. Never store the secret key in plaintext or
in any environment variable that is committed to version control.

```bash
# Generate a new keypair (software fallback — prefer hardware wallet)
stellar keys generate trivela-admin --network mainnet
stellar keys address trivela-admin
```

Record the public key (`G...`). Store the secret key in a hardware wallet or a secrets manager
(Vault, AWS Secrets Manager, GCP Secret Manager).

### 2.2 Fund the admin account

The admin account needs XLM to cover:

- Base reserve (1 XLM minimum)
- Transaction fees for contract deployment (~0.1 XLM per contract)
- Ongoing admin operations

Send at least **10 XLM** to the admin public key before proceeding.

```bash
stellar account info --network mainnet <ADMIN_PUBLIC_KEY>
```

Confirm the account is funded and active (sequence number > 0).

---

## 3. Contract Deployment

### 3.1 Build release WASM

```bash
cargo build --target wasm32-unknown-unknown --release \
  -p trivela-rewards-contract \
  -p trivela-campaign-contract \
  -p trivela-badges-contract \
  -p trivela-nullifiers-contract \
  -p trivela-voting-contract
```

### 3.2 Deploy to mainnet

The deploy script reads `STELLAR_NETWORK` and `STELLAR_SOURCE`. When `STELLAR_NETWORK=mainnet` you
must also set `MAINNET_CONFIRMED=true` — this guard prevents accidental mainnet deploys.

```bash
STELLAR_NETWORK=mainnet \
MAINNET_CONFIRMED=true \
STELLAR_SOURCE=trivela-admin \
TRIVELA_ENV_OUT=.env.mainnet \
TRIVELA_BACKEND_ENV=backend/.env.mainnet \
  bash ./scripts/deploy-testnet.sh
```

Or use the dedicated alias:

```bash
npm run deploy:mainnet
```

`deploy:mainnet` still requires `STELLAR_SOURCE` and `MAINNET_CONFIRMED=true` in the environment.

### 3.3 Record contract IDs

The script writes contract IDs to `.env.mainnet` and `backend/.env.mainnet`. Commit the **public**
contract IDs (not secret keys) to the repository so they are auditable:

```
VITE_REWARDS_CONTRACT_ID=C...
VITE_CAMPAIGN_CONTRACT_ID=C...
```

### 3.4 Verify on-chain

```bash
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- admin
```

The output should be the admin public key you used to deploy.

---

## 4. Backend Configuration

Set these environment variables in your secrets manager / deployment platform. Never commit secret
values to git.

### Required

| Variable                | Description                                        | Mainnet value                                    |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `NODE_ENV`              | Runtime environment                                | `production`                                     |
| `STELLAR_NETWORK`       | Network identifier                                 | `mainnet` (or `public` for some Stellar SDKs)   |
| `SOROBAN_RPC_URL`       | Primary Soroban RPC endpoint                       | `https://soroban.stellar.org` or a private node  |
| `HORIZON_URL`           | Horizon REST endpoint                              | `https://horizon.stellar.org`                    |
| `DATABASE_URL`          | PostgreSQL connection string                       | `postgresql://user:pass@host:5432/trivela`        |
| `TRIVELA_API_KEYS`      | Comma-separated admin API keys (min 32 chars each) | generated via `openssl rand -hex 32`              |
| `TRIVELA_MASTER_KEY`    | Master API key for privileged operations           | generated via `openssl rand -hex 32`              |
| `TRIVELA_JWT_SECRET`    | JWT signing secret (min 32 chars)                  | generated via `openssl rand -hex 32`              |
| `STELLAR_SECRET_KEY`    | Secret key for SEP-10 / sponsored accounts         | hardware wallet export or secrets manager ref     |
| `CORS_ALLOWED_ORIGINS`  | Comma-separated allowed origins                    | `https://trivela.com` (no trailing slash)         |
| `REWARDS_CONTRACT_ID`   | Deployed rewards contract address                  | from step 3.3                                    |
| `CAMPAIGN_CONTRACT_ID`  | Deployed campaign contract address                 | from step 3.3                                    |

### Optional but recommended for production

| Variable                        | Description                                  | Default      |
| ------------------------------- | -------------------------------------------- | ------------ |
| `SOROBAN_RPC_URLS`              | Additional RPC endpoints (comma-separated)   | —            |
| `REDIS_URL`                     | Redis connection string for rate-limit store | in-memory    |
| `PORT`                          | Listening port                               | `3001`       |
| `RATE_LIMIT_WINDOW_MS`          | Rate-limit window in ms                      | `60000`      |
| `RATE_LIMIT_MAX_REQUESTS`       | Max requests per window                      | `100`        |
| `STORAGE_BACKEND`               | `local`, `s3`, or `gcs`                      | `local`      |
| `AWS_REGION`                    | AWS region (when `STORAGE_BACKEND=s3`)       | —            |
| `VAPID_PUBLIC_KEY`              | Web Push VAPID public key                    | —            |
| `VAPID_PRIVATE_KEY`             | Web Push VAPID private key                   | —            |
| `VAPID_SUBJECT`                 | Web Push subject (`mailto:` or URL)          | —            |
| `OTEL_EXPORTER_OTLP_ENDPOINT`  | OpenTelemetry collector endpoint             | —            |
| `OTEL_SERVICE_NAME`             | Service name for traces                      | `trivela`    |
| `SITE_URL`                      | Public site URL (used in emails/webhooks)    | —            |
| `ENABLE_WEBSOCKET`              | Enable WebSocket server                      | `true`       |

Validate the configuration before starting:

```bash
node ./scripts/validate-env.mjs
```

---

## 5. Kubernetes / Helm

Edit `helm/trivela/values.yaml` or provide a `values.mainnet.yaml` override file. The following
values **must** change from their defaults for mainnet:

```yaml
backend:
  image:
    repository: ghcr.io/your-org/trivela-backend   # use your registry
    tag: "v1.2.3"                                   # pin to a specific release tag — never "latest"
    pullPolicy: IfNotPresent
  replicaCount: 3                                   # minimum 3 for HA
  resources:
    requests:
      cpu: "250m"
      memory: "256Mi"
    limits:
      cpu: "1000m"
      memory: "1Gi"

frontend:
  image:
    repository: ghcr.io/your-org/trivela-frontend
    tag: "v1.2.3"
    pullPolicy: IfNotPresent
  replicaCount: 2

ingress:
  host: trivela.com                                 # production domain
  tls:
    enabled: true
    secretName: trivela-tls
    clusterIssuer: letsencrypt-prod

autoscaling:
  minReplicas: 3
  maxReplicas: 20

config:
  nodeEnv: production
  corsOrigin: "https://trivela.com"

secrets:
  # Inject real values from your secrets manager — never commit here
  databaseUrl: "postgresql://trivela_user:REAL_PASS@db.internal:5432/trivela_prod"
  jwtSecret: "REAL_SECRET_AT_LEAST_32_CHARS"
  sorobanRpcUrl: "https://soroban.stellar.org"
```

Deploy with:

```bash
helm upgrade --install trivela ./helm/trivela \
  -f helm/trivela/values.yaml \
  -f helm/values.mainnet.yaml \
  --namespace trivela-prod \
  --create-namespace \
  --atomic \
  --timeout 5m
```

---

## 6. SSL / Nginx

The nginx config lives in `nginx/trivela.conf.template`. It is processed by `deploy-blue-green.sh`
using `envsubst`.

**Required variables before running the nginx deployment:**

| Variable                 | Mainnet value                       |
| ------------------------ | ----------------------------------- |
| `TRIVELA_BACKEND_HOST`   | Internal hostname of the backend    |
| `TRIVELA_BACKEND_PORT`   | `3001` (blue) or `3002` (green)     |

**CORS**: `CORS_ALLOWED_ORIGINS` in the backend env must be set to the exact production frontend
origin (e.g., `https://trivela.com`). The wildcard `*` must **never** be used in production.

**TLS**: Terminate TLS at the ingress controller or load balancer. The nginx template currently
listens on port 80 — the ingress must redirect HTTP → HTTPS and attach the TLS certificate.
The `Strict-Transport-Security` header is already included in the template.

**CSP**: Review the `Content-Security-Policy` header if you add third-party scripts or CDN assets.
The embed route allows `frame-ancestors *` — confirm this is intentional for your embed use case.

---

## 7. Smoke Test

Run this checklist after deployment and before announcing mainnet availability.

### Infrastructure

- [ ] `GET https://trivela.com/health` returns `{"status":"ok"}` with HTTP 200
- [ ] TLS certificate is valid, not expired, and covers the correct domain
- [ ] HTTP → HTTPS redirect works (`curl -I http://trivela.com`)
- [ ] `X-Content-Type-Options: nosniff` and `Strict-Transport-Security` headers present
- [ ] Kubernetes pods are all in `Running` state: `kubectl get pods -n trivela-prod`
- [ ] HPA is active: `kubectl get hpa -n trivela-prod`

### Stellar / Contracts

- [ ] Soroban RPC health endpoint responds: `GET <SOROBAN_RPC_URL>/health`
- [ ] `stellar contract invoke -- admin` returns the expected admin public key for each contract
- [ ] Horizon account lookup confirms admin account is funded: `GET <HORIZON_URL>/accounts/<ADMIN_KEY>`

### Backend API

- [ ] `GET /api/campaigns` returns a valid (possibly empty) list
- [ ] `POST /api/campaigns` with a valid API key creates a campaign successfully
- [ ] Invalid API key returns HTTP 401
- [ ] Rate-limit headers (`X-RateLimit-*`) present on API responses

### Frontend

- [ ] Frontend loads at `https://trivela.com` without console errors
- [ ] Network indicator shows "Mainnet" / "Public"
- [ ] Freighter wallet connection succeeds on mainnet
- [ ] Campaign list displays any contracts deployed in step 3

### Observability

- [ ] Logs flowing to your log aggregator (no gaps in backend logs)
- [ ] Prometheus scraping `/metrics` if OpenTelemetry is configured
- [ ] Alert channels (PagerDuty / Slack) receive a test notification

---

## References

- [DEPLOYMENT.md](./DEPLOYMENT.md) — blue/green and restart policies
- [KUBERNETES.md](./KUBERNETES.md) — full Kubernetes reference
- [SECURITY.md](./SECURITY.md) — key rotation and incident response
- [MAINNET_CHECKLIST.md](./MAINNET_CHECKLIST.md) — sign-off checklist for all contributors
- [RUNBOOK.md](./RUNBOOK.md) — rollback and incident procedures

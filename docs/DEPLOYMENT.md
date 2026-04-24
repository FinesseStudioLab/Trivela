# Production Deployment Guide

This guide covers deploying Trivela (backend, frontend, and smart contracts) to production environments.

## Prerequisites

- **Rust** with `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- **Stellar CLI**: [Install](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli)
- **Node.js** 20+
- **Docker** (for containerized backend)
- **Git** for version control

## Environment Matrix

### Backend Environment Variables

| Variable                  | Required | Default | Example                                                    | Notes                                  |
| ------------------------- | -------- | ------- | ---------------------------------------------------------- | -------------------------------------- |
| `PORT`                    | No       | `3001`  | `8080`                                                     | Server port                            |
| `STELLAR_NETWORK`         | Yes      | —       | `testnet` or `mainnet`                                     | Stellar network                        |
| `SOROBAN_RPC_URL`         | Yes      | —       | `https://soroban-mainnet.stellar.org`                      | Soroban RPC endpoint                   |
| `CORS_ALLOWED_ORIGINS`    | No       | —       | `https://app.example.com,https://admin.example.com`        | Comma-separated allowed origins        |
| `CORS_ORIGIN`             | No       | —       | `https://app.example.com`                                  | Legacy single-origin CORS (fallback)   |
| `TRIVELA_API_KEY`         | No       | —       | `sk_prod_abc123...`                                        | API key for write endpoints (optional) |
| `REWARDS_CONTRACT_ID`     | No       | —       | `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4` | Rewards contract address               |
| `CAMPAIGN_CONTRACT_ID`    | No       | —       | `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4` | Campaign contract address              |
| `RATE_LIMIT_WINDOW_MS`    | No       | `60000` | `60000`                                                    | Rate limit window in milliseconds      |
| `RATE_LIMIT_MAX_REQUESTS` | No       | `60`    | `100`                                                      | Max requests per window per key/IP     |

### Frontend Environment Variables

| Variable                          | Required | Default | Example                                                    | Notes                     |
| --------------------------------- | -------- | ------- | ---------------------------------------------------------- | ------------------------- |
| `VITE_API_URL`                    | Yes      | —       | `https://api.example.com`                                  | Backend API base URL      |
| `VITE_SOROBAN_RPC_URL`            | Yes      | —       | `https://soroban-mainnet.stellar.org`                      | Soroban RPC endpoint      |
| `VITE_STELLAR_NETWORK_PASSPHRASE` | Yes      | —       | `Public Global Stellar Network ; September 2015`           | Network passphrase        |
| `VITE_REWARDS_CONTRACT_ID`        | No       | —       | `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4` | Rewards contract address  |
| `VITE_CAMPAIGN_CONTRACT_ID`       | No       | —       | `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4` | Campaign contract address |

### Contract Deployment Environment Variables

| Variable          | Required | Default | Example                               | Notes                    |
| ----------------- | -------- | ------- | ------------------------------------- | ------------------------ |
| `STELLAR_NETWORK` | Yes      | —       | `testnet` or `mainnet`                | Target network           |
| `SOROBAN_RPC_URL` | Yes      | —       | `https://soroban-mainnet.stellar.org` | Soroban RPC endpoint     |
| `STELLAR_ACCOUNT` | Yes      | —       | `GXXXXXX...`                          | Admin account public key |

## Deployment Steps

### 1. Smart Contracts

#### Build contracts

```bash
npm run build:contracts
```

#### Deploy to Stellar network

```bash
export STELLAR_NETWORK=mainnet
export SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
export STELLAR_ACCOUNT=<your-admin-public-key>

bash ./scripts/deploy-testnet.sh
```

The script outputs contract IDs to `.env.contracts.mainnet` for reference.

**Important:** Store contract IDs securely. They are immutable and required for all subsequent deployments.

### 2. Backend Deployment

#### Option A: Docker (Recommended)

Create `.env.production` in the `backend/` directory:

```bash
PORT=3001
STELLAR_NETWORK=mainnet
SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
CORS_ALLOWED_ORIGINS=https://app.example.com
TRIVELA_API_KEY=sk_prod_<random-secure-key>
REWARDS_CONTRACT_ID=<contract-id>
CAMPAIGN_CONTRACT_ID=<contract-id>
RATE_LIMIT_MAX_REQUESTS=100
```

Build and run:

```bash
docker build -t trivela-backend:latest backend/
docker run -d \
  --name trivela-backend \
  -p 3001:3001 \
  --env-file backend/.env.production \
  trivela-backend:latest
```

#### Option B: Node.js (Direct)

```bash
cd backend
npm install --production
npm start
```

#### Health checks

```bash
# Basic health
curl https://api.example.com/health

# RPC health
curl https://api.example.com/health/rpc

# Metrics (Prometheus format)
curl https://api.example.com/metrics
```

### 3. Frontend Deployment

#### Build

```bash
npm run build:frontend
```

Output is in `frontend/dist/`.

#### Deploy to CDN or static host

**Vercel:**

```bash
npm install -g vercel
vercel --prod
```

**Netlify:**

```bash
npm install -g netlify-cli
netlify deploy --prod --dir frontend/dist
```

**AWS S3 + CloudFront:**

```bash
aws s3 sync frontend/dist s3://my-bucket/
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

#### Environment setup

Create `frontend/.env.production`:

```bash
VITE_API_URL=https://api.example.com
VITE_SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
VITE_REWARDS_CONTRACT_ID=<contract-id>
VITE_CAMPAIGN_CONTRACT_ID=<contract-id>
```

## Recommended Hosting Patterns

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Users / Browsers                      │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   ┌────▼─────┐          ┌───────▼──────┐
   │   CDN    │          │  API Gateway  │
   │(Frontend)│          │  (Rate Limit) │
   └────┬─────┘          └───────┬──────┘
        │                        │
        │                   ┌────▼──────────┐
        │                   │ Backend (Node)│
        │                   │  (Stateless)  │
        │                   └────┬──────────┘
        │                        │
        └────────────┬───────────┘
                     │
            ┌────────▼────────┐
            │  Soroban RPC    │
            │  (Stellar)      │
            └─────────────────┘
```

### Backend Scaling

- **Stateless design**: Each backend instance is independent; no session affinity needed.
- **Load balancer**: Use round-robin or least-connections.
- **Rate limiting**: Configured per API key or IP; adjust `RATE_LIMIT_MAX_REQUESTS` based on load.
- **Monitoring**: Scrape `/metrics` endpoint with Prometheus.

### Database

- **Campaign metadata**: Stored in SQLite (backend). For multi-instance deployments, migrate to PostgreSQL.
- **On-chain state**: Rewards and campaign participation stored in Soroban contracts; backend is read-only.

### Security

- **API Key**: Generate strong random key; rotate periodically.
- **CORS**: Whitelist only trusted origins.
- **HTTPS**: Always use TLS in production.
- **RPC URL**: Use private RPC endpoints if available.
- **Secrets**: Store in environment variables or secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.).

## Monitoring & Observability

### Health Checks

Set up monitoring for:

```bash
# Every 30 seconds
curl -f https://api.example.com/health || alert
```

### Metrics

Scrape `/metrics` with Prometheus:

```yaml
scrape_configs:
  - job_name: "trivela-api"
    static_configs:
      - targets: ["api.example.com:443"]
    scheme: https
```

Key metrics:

- `trivela_requests_total` – Total requests
- `trivela_request_errors_total` – Errors (4xx, 5xx)
- `trivela_process_uptime_seconds` – Uptime
- `trivela_route_hits_total` – Per-route request counts

### Logging

Backend logs to stdout. Capture with:

- **Docker**: `docker logs trivela-backend`
- **Kubernetes**: Pod logs
- **Cloud**: CloudWatch, Stackdriver, etc.

## Rollback & Disaster Recovery

### Contract Rollback

Contracts are immutable. To rollback:

1. Deploy a new contract version.
2. Update `REWARDS_CONTRACT_ID` or `CAMPAIGN_CONTRACT_ID` in backend/frontend.
3. Redeploy backend and frontend.

### Backend Rollback

```bash
# Stop current version
docker stop trivela-backend

# Run previous version
docker run -d --name trivela-backend-prev \
  --env-file backend/.env.production \
  trivela-backend:previous-tag
```

### Frontend Rollback

Revert CDN to previous build or redeploy from git tag.

## Troubleshooting

### Backend won't start

```bash
# Check environment variables
env | grep STELLAR_NETWORK

# Check RPC connectivity
curl https://soroban-mainnet.stellar.org/health

# Check logs
docker logs trivela-backend
```

### Frontend can't reach backend

```bash
# Verify CORS
curl -H "Origin: https://app.example.com" https://api.example.com/health

# Check VITE_API_URL
grep VITE_API_URL frontend/.env.production
```

### Contract calls fail

```bash
# Verify contract IDs
curl https://api.example.com/api/v1/config

# Check RPC health
curl https://api.example.com/health/rpc
```

## Support

For deployment issues, open an issue on [GitHub](https://github.com/FinesseStudioLab/Trivela/issues) or check [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md).

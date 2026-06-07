# Mainnet Deployment Guide

This guide walks through deploying Trivela to Stellar mainnet end-to-end: contracts, backend, frontend,
and infrastructure. Complete the [Mainnet Launch Readiness Checklist](MAINNET_CHECKLIST.md) before
going live.

For network presets and endpoint defaults, see [STELLAR_NETWORKS.md](STELLAR_NETWORKS.md).

---

## Table of Contents

1. [Pre-flight checks](#1-pre-flight-checks)
2. [Wallet and key setup](#2-wallet-and-key-setup)
3. [Contract deployment](#3-contract-deployment)
4. [Backend configuration](#4-backend-configuration)
5. [Frontend configuration](#5-frontend-configuration)
6. [Kubernetes / Helm](#6-kubernetes--helm)
7. [SSL and Nginx](#7-ssl-and-nginx)
8. [Smoke test](#8-smoke-test)
9. [Post-launch](#9-post-launch)

---

## 1. Pre-flight checks

Run these from the repository root before touching mainnet.

### Contract tests

```bash
npm run test:contracts
```

All workspace contract tests must pass. Fix failures before deploying.

### TypeScript bindings in sync

Regenerate bindings from the current WASM artifacts and confirm there are no uncommitted changes:

```bash
npm run contracts:build-bindings
git diff --exit-code frontend/src/contracts/
```

If `git diff` reports changes, commit the updated bindings or rebuild contracts first.

### Dependency audit

Install and run `cargo-audit` against the contract workspace:

```bash
cargo install cargo-audit
cargo audit
```

Resolve any reported vulnerabilities (or document accepted risks in your launch review) before
mainnet deployment.

### Launch checklist

Review [MAINNET_CHECKLIST.md](MAINNET_CHECKLIST.md) and confirm security audit, TTL, admin rotation,
and infrastructure items are complete.

---

## 2. Wallet and key setup

### Generate a dedicated admin keypair

1. Create a **new** keypair used only for Trivela contract administration — never reuse a personal
   wallet.
2. Prefer a **hardware wallet** (Ledger + Freighter) or a cold key stored offline.
3. Record the public key (`G...`) — this becomes the contract `admin` at `initialize` time.

> Do not paste secret keys into chat, tickets, or CI logs. See [SECURITY.md](SECURITY.md) for
> rotation and compromise procedures.

### Fund the deploy account

The `STELLAR_SOURCE` identity must hold enough **XLM** on mainnet to:

- Pay transaction fees for WASM uploads and contract deployments (typically a few XLM; keep ≥ 5 XLM
  as buffer).
- Cover any follow-up initialization or admin transactions.

Verify balance on [Stellar Expert](https://stellar.expert/explorer/public) or via Horizon:

```bash
stellar account balance --address <G...> --network mainnet
```

### Configure the Stellar CLI identity

```bash
# Option A: named identity (recommended)
stellar keys add trivela-mainnet-deploy --secret-key <S...>
export STELLAR_SOURCE=trivela-mainnet-deploy

# Option B: public key only (signing via hardware wallet / external signer)
export STELLAR_SOURCE=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

## 3. Contract deployment

Trivela ships two Soroban contracts: **rewards** and **campaign**. The deploy script builds both
WASM artifacts and writes contract IDs to env files.

### Recommended: use the mainnet wrapper

```bash
export STELLAR_SOURCE=trivela-mainnet-deploy   # or your G... address
export TRIVELA_BACKEND_ENV=.env.mainnet       # optional backend env output

npm run deploy:mainnet
```

This sets `STELLAR_NETWORK=mainnet`, requires explicit mainnet confirmation, and writes
`.env.mainnet` with `VITE_*` contract IDs.

### Manual invocation

```bash
STELLAR_NETWORK=mainnet \
TRIVELA_CONFIRM_MAINNET=yes \
STELLAR_SOURCE=trivela-mainnet-deploy \
TRIVELA_ENV_OUT=.env.mainnet \
TRIVELA_BACKEND_ENV=.env.mainnet \
./scripts/deploy-testnet.sh
```

### Mainnet safety guard

`scripts/deploy-testnet.sh` defaults to **testnet**. Deploying to mainnet requires **both**:

| Variable | Value | Purpose |
| -------- | ----- | ------- |
| `STELLAR_NETWORK` | `mainnet` | Selects the mainnet network preset |
| `TRIVELA_CONFIRM_MAINNET` | `yes` | Explicit operator acknowledgement |

Without `TRIVELA_CONFIRM_MAINNET=yes`, the script exits with an error even if `STELLAR_NETWORK` is
set — this prevents accidental mainnet deploys from a mistyped env var.

### After deployment

1. Record both contract IDs and the deployment transaction hashes.
2. Call `initialize` on each contract with your admin address (see below).
3. Copy contract IDs into backend and frontend production env (see below).

#### Initialize contracts (Stellar CLI)

Replace `<ADMIN_IDENTITY>`, `<REWARDS_ID>`, and `<CAMPAIGN_ID>` with your values. The admin identity
must match the keypair that will control the contracts in production.

```bash
# Rewards contract — requires admin, name, and symbol
stellar contract invoke \
  --id <REWARDS_ID> \
  --source <ADMIN_IDENTITY> \
  --network mainnet \
  -- initialize \
  --admin <ADMIN_IDENTITY> \
  --name "Trivela_Rewards" \
  --symbol "TVL"

# Campaign contract — requires admin only
stellar contract invoke \
  --id <CAMPAIGN_ID> \
  --source <ADMIN_IDENTITY> \
  --network mainnet \
  -- initialize \
  --admin <ADMIN_IDENTITY>
```

Verify initialization:

```bash
stellar contract invoke --id <REWARDS_ID> --network mainnet -- admin
stellar contract invoke --id <CAMPAIGN_ID> --network mainnet -- admin
```

Both should return your admin public key (`G...`).

---

## 4. Backend configuration

Copy [`backend/.env.example`](../backend/.env.example) to your secrets manager or deployment config.
Set every production value — do not rely on defaults.

### Required variables

| Variable | Mainnet value | Notes |
| -------- | ------------- | ----- |
| `NODE_ENV` | `production` | Enables production logging and error handling |
| `PORT` | `3001` | Internal listen port (behind reverse proxy) |
| `DATABASE_URL` | `postgresql://...` | **PostgreSQL required** for multi-instance production |
| `STELLAR_NETWORK` | `mainnet` | Must match deployed contracts |
| `SOROBAN_RPC_URL` | `https://soroban-mainnet.stellar.org` | See [STELLAR_NETWORKS.md](STELLAR_NETWORKS.md) |
| `HORIZON_URL` | `https://horizon.stellar.org` | Used for account/transaction reads |
| `REWARDS_CONTRACT_ID` | `C...` | From deploy script output |
| `CAMPAIGN_CONTRACT_ID` | `C...` | From deploy script output |
| `CORS_ALLOWED_ORIGINS` | `https://app.yourdomain.com` | **Must** match your production frontend origin |
| `TRIVELA_API_KEYS` | `sk_prod_...` | Comma-separated write/admin API keys (generate strong random values). This is the production API secret referenced in deployment checklists — there is no separate `API_KEY_SECRET` variable in this repo. |
| `TRIVELA_MASTER_KEY` | `mk_prod_...` | Master key for API key management endpoints |

### Strongly recommended for production

| Variable | Purpose |
| -------- | ------- |
| `REDIS_URL` | Shared rate-limit state across backend replicas |
| `RATE_LIMIT_MAX_REQUESTS` | Tune for expected traffic (default `60`/min may be low or high) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Distributed tracing / monitoring |
| `STORAGE_BACKEND` | `s3` or `ipfs` for durable campaign images (not `local`) |
| `S3_BUCKET` / `AWS_REGION` | When using S3 image storage |
| `JOB_MAX_RETRIES` | Background job retry policy |

### Secrets handling

- Store secrets in your platform's secret manager (Kubernetes Secret, AWS SSM, Vault, etc.).
- **Rotate all values** that were used on testnet — never reuse testnet API keys on mainnet.
- Run `npm run env:validate` locally against a sanitized copy to catch missing required keys.

### Verify backend

```bash
curl -s https://api.yourdomain.com/health | jq .
curl -s https://api.yourdomain.com/api/v1/config | jq .
```

Confirm `stellarNetwork` is `mainnet` and contract IDs match your deployment.

---

## 5. Frontend configuration

Build-time variables (set in your CI/CD or hosting dashboard):

| Variable | Mainnet value |
| -------- | ------------- |
| `VITE_STELLAR_NETWORK` | `mainnet` |
| `VITE_REWARDS_CONTRACT_ID` | `C...` |
| `VITE_CAMPAIGN_CONTRACT_ID` | `C...` |
| `VITE_API_URL` | `https://api.yourdomain.com` |
| `VITE_SITE_URL` | `https://app.yourdomain.com` |

The frontend also fetches `/api/v1/config` at boot and prefers backend-provided network settings
when available — keep backend and frontend contract IDs aligned.

Build and deploy:

```bash
cd frontend
npm ci
npm run build
# Deploy dist/ to your static host or container image
```

---

## 6. Kubernetes / Helm

Trivela can be deployed with raw manifests (`k8s/`) or the Helm chart (`helm/trivela/`). See
[KUBERNETES.md](KUBERNETES.md) for cluster prerequisites.

### Values you must override for mainnet

Edit a production values file (e.g. `helm/production-values.yaml`) — **never commit real secrets**.

| Key | Testnet default | Mainnet override |
| --- | --------------- | ---------------- |
| `backend.image.tag` | `latest` | Pin to a **specific release tag** (e.g. `v1.2.0`) |
| `frontend.image.tag` | `1.25-alpine` | Pin to your built frontend image tag |
| `backend.replicaCount` | `2` | `≥ 2` for HA (scale per load) |
| `frontend.replicaCount` | `2` | `≥ 2` for HA |
| `backend.resources.limits` | `512Mi` / `500m` | Increase for production traffic |
| `ingress.host` | `trivela.example.com` | Your production domain |
| `ingress.tls.enabled` | `true` | Keep enabled; use `letsencrypt-prod` issuer |
| `config.corsOrigin` | `https://trivela.example.com` | Your production frontend URL |
| `secrets.databaseUrl` | placeholder | Production PostgreSQL connection string |
| `secrets.jwtSecret` | placeholder | Strong random secret (≥ 32 chars) |
| `secrets.sorobanRpcUrl` | testnet RPC | `https://soroban-mainnet.stellar.org` |

Deploy:

```bash
helm upgrade --install trivela ./helm/trivela \
  -f helm/production-values.yaml \
  --namespace trivela --create-namespace
```

### Raw `k8s/` manifests

Update the same values in:

- [`k8s/secret.yaml`](../k8s/secret.yaml) — `DATABASE_URL`, `JWT_SECRET`, `SOROBAN_RPC_URL`
- [`k8s/configmap.yaml`](../k8s/configmap.yaml) — `CORS_ORIGIN`, `NODE_ENV`
- [`k8s/ingress.yaml`](../k8s/ingress.yaml) — host and TLS settings
- [`k8s/hpa.yaml`](../k8s/hpa.yaml) — `minReplicas` / `maxReplicas` for expected load

---

## 7. SSL and Nginx

### Ingress TLS (Kubernetes)

The Helm chart and `k8s/ingress.yaml` use **cert-manager** with a `ClusterIssuer` (e.g.
`letsencrypt-prod`). Confirm your issuer is configured and the certificate reaches `Ready` status:

```bash
kubectl describe certificate trivela-tls
```

### Standalone Nginx (`nginx/`)

For blue/green or VM deployments, use [`nginx/trivela.conf.template`](../nginx/trivela.conf.template).
`scripts/deploy-blue-green.sh` substitutes `TRIVELA_BACKEND_HOST` and `TRIVELA_BACKEND_PORT`, then
reloads Nginx.

Production checklist:

- Terminate TLS at the load balancer or Nginx (`listen 443 ssl`).
- Set `CORS_ALLOWED_ORIGINS` on the **backend** to your production frontend domain (e.g.
  `https://app.yourdomain.com`). The backend enforces CORS — Nginx does not replace this.
- Security headers (`X-Content-Type-Options`, `HSTS`, etc.) are included in the template.
- `/embed/*` routes allow framing for campaign widgets; all other routes deny framing.

---

## 8. Smoke test

Complete this checklist before announcing the mainnet launch. All steps should pass without manual
workarounds.

### Infrastructure

- [ ] `GET /health` returns `{"status":"ok"}` on the production API URL
- [ ] `GET /api/v1/config` reports `stellarNetwork: "mainnet"` and correct contract IDs
- [ ] Frontend loads over HTTPS with no mixed-content warnings
- [ ] CORS: frontend can call the API (no browser CORS errors in DevTools)

### Contracts (on-chain)

- [ ] Rewards contract `admin()` returns the expected admin address
- [ ] Campaign contract `admin()` returns the expected admin address
- [ ] `is_active()` (or equivalent) reflects intended launch state

### API flows

- [ ] `GET /api/v1/campaigns` returns a valid paginated response
- [ ] Create a **private test campaign** via `POST /api/v1/campaigns` with an admin API key
- [ ] Upload or attach a campaign image (if using S3/IPFS storage)
- [ ] Delete or deactivate the test campaign after verification

### Wallet flows (manual)

- [ ] Connect Freighter on mainnet in the production frontend
- [ ] Register for a test campaign (small XLM fee transaction succeeds)
- [ ] Confirm participant count increments on-chain and in the UI
- [ ] (If enabled) Credit and claim rewards for a test account

### Monitoring

- [ ] Alerts configured for `/health` failures and elevated 5xx rates
- [ ] Error tracking / tracing receiving events (OTel endpoint configured)
- [ ] Runbook accessible to on-call: [RUNBOOK.md](RUNBOOK.md)

### Rollback readiness

- [ ] Previous backend image tag documented and redeployable
- [ ] Database backup verified within the last 24 hours
- [ ] Blue/green or canary procedure tested in staging

---

## 9. Post-launch

- Monitor `/health`, RPC error rates, and wallet transaction failures for the first 48 hours.
- Keep deployment transaction hashes and contract IDs in your internal runbook.
- Schedule admin key rotation using the two-step procedure in [SECURITY.md](SECURITY.md).
- Update [MAINNET_CHECKLIST.md](MAINNET_CHECKLIST.md) with evidence links as items are completed.

---

## Quick reference

| Task | Command |
| ---- | ------- |
| Run contract tests | `npm run test:contracts` |
| Sync bindings | `npm run contracts:build-bindings` |
| Audit dependencies | `cargo audit` |
| Deploy to mainnet | `npm run deploy:mainnet` |
| Validate env file | `npm run env:validate` |
| Helm deploy | `helm upgrade --install trivela ./helm/trivela -f production-values.yaml` |

## Related docs

- [MAINNET_CHECKLIST.md](MAINNET_CHECKLIST.md) — launch readiness checklist
- [SECURITY.md](SECURITY.md) — key rotation and incident response
- [STELLAR_NETWORKS.md](STELLAR_NETWORKS.md) — network presets and endpoints
- [KUBERNETES.md](KUBERNETES.md) — cluster deployment details
- [DEPLOYMENT.md](DEPLOYMENT.md) — blue/green and admin rotation overview
- [E2E_TESTING.md](E2E_TESTING.md) — automated lifecycle tests (adapt for staging/mainnet)

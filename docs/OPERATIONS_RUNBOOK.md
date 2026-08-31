# Trivela Operations Runbook

> **Mainnet Operations Guide**: Deploy, Verify, Monitor, and Rollback

This runbook provides step-by-step procedures for operating Trivela on Stellar mainnet. All
procedures are designed for production safety with verification checkpoints and rollback paths.

---

## Table of Contents

1. [Deployment Procedures](#1-deployment-procedures)
2. [Verification & Health Checks](#2-verification--health-checks)
3. [Monitoring & Alerting](#3-monitoring--alerting)
4. [Rollback Procedures](#4-rollback-procedures)
5. [Incident Response](#5-incident-response)
6. [Common Operations](#6-common-operations)
7. [Emergency Contacts](#7-emergency-contacts)

---

## 1. Deployment Procedures

### 1.1 Pre-Deployment Checklist

**Prerequisites** (complete BEFORE starting deployment):

```bash
# ✅ All tests pass
cargo test --workspace
npm run test

# ✅ No security vulnerabilities
cargo audit
npm audit --audit-level=high

# ✅ Bindings in sync
npm run codegen:check

# ✅ Deployment artifacts ready
git tag -a v$(date +%Y.%m.%d) -m "Mainnet release $(date +%Y-%m-%d)"
git push origin --tags
```

**Approvals Required**:

- [ ] Code review approved by 2+ maintainers
- [ ] Security review completed
- [ ] Deployment window scheduled (announce maintenance if needed)
- [ ] On-call engineer assigned

### 1.2 Contract Deployment

**When**: New contract features, bug fixes, or upgrades

**Procedure**:

```bash
# Step 1: Build release WASM
cd /path/to/trivela
cargo build --target wasm32-unknown-unknown --release \
  -p trivela-rewards-contract \
  -p trivela-campaign-contract

# Step 2: Upload WASM and get hash (does NOT deploy yet)
stellar contract install \
  --wasm target/wasm32-unknown-unknown/release/trivela_rewards_contract.wasm \
  --network mainnet \
  --source trivela-admin

# Output: <WASM_HASH>
# Record this hash - you'll need it for step 4

# Step 3: Call upgrade() on existing contract
stellar contract invoke \
  --id <EXISTING_REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- upgrade \
  --admin <ADMIN_PUBLIC_KEY> \
  --nonce <CURRENT_NONCE> \
  --new_wasm_hash <WASM_HASH>

# Step 4: Verify upgrade succeeded
stellar contract invoke \
  --id <EXISTING_REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- schema_version

# Should return: 1 (or expected version)
```

**⚠️ Critical**: Test upgrade on testnet FIRST with identical WASM

**Rollback**: See [§4.2 Contract Rollback](#42-contract-rollback)

### 1.3 Backend Deployment (Blue-Green)

**When**: API changes, backend features, performance improvements

**Procedure**:

```bash
# Step 1: Deploy to GREEN environment (inactive)
export DEPLOYMENT_COLOR=green
export BACKEND_PORT=3002
export DOCKER_TAG=v2024.01.15

# Build and push image
docker build -t ghcr.io/your-org/trivela-backend:${DOCKER_TAG} -f backend/Dockerfile .
docker push ghcr.io/your-org/trivela-backend:${DOCKER_TAG}

# Deploy to Kubernetes GREEN
kubectl set image deployment/trivela-backend-green \
  backend=ghcr.io/your-org/trivela-backend:${DOCKER_TAG} \
  -n trivela-prod

# Wait for rollout
kubectl rollout status deployment/trivela-backend-green -n trivela-prod --timeout=5m

# Step 2: Smoke test GREEN environment
curl -f https://trivela.com:3002/health || { echo "GREEN health check failed"; exit 1; }
curl -f https://trivela.com:3002/api/v1/campaigns | jq '.campaigns | length'

# Step 3: Switch traffic to GREEN
./scripts/deploy-blue-green.sh green

# Step 4: Verify traffic flowing to GREEN
kubectl logs -l app=trivela-backend-green -n trivela-prod --tail=50 | grep "GET /health"

# Step 5: Keep BLUE running for 10 minutes as hot backup
sleep 600

# Step 6: Scale down BLUE (keep 1 replica for fast rollback)
kubectl scale deployment/trivela-backend-blue --replicas=1 -n trivela-prod
```

**Rollback**: `./scripts/deploy-blue-green.sh blue`

### 1.4 Frontend Deployment

**When**: UI changes, new features, bug fixes

**Procedure**:

```bash
# Step 1: Build production bundle
cd frontend
npm run build

# Verify bundle size (should be < 500KB gzipped)
npm run check:bundle

# Step 2: Upload to CDN/S3
aws s3 sync dist/ s3://trivela-frontend-prod/ \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"

# index.html gets shorter cache (revalidate frequently)
aws s3 cp dist/index.html s3://trivela-frontend-prod/index.html \
  --cache-control "public, max-age=300, must-revalidate"

# Step 3: Invalidate CDN cache
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"

# Step 4: Verify deployment
curl -I https://trivela.com/ | grep "x-cache"
# Should show: x-cache: Miss from cloudfront (first request after invalidation)
```

**Rollback**: Re-deploy previous version from git tag

```bash
git checkout v2024.01.14
cd frontend && npm run build
# ... repeat upload steps above
```

---

## 2. Verification & Health Checks

### 2.1 System Health Dashboard

**Check these endpoints after EVERY deployment**:

```bash
# Backend health
curl -f https://trivela.com/health
# Expected: {"status":"ok","uptime":12345,"version":"1.2.3"}

# API v1 health (with service checks)
curl -f https://trivela.com/api/v1/health
# Expected: {"status":"ok","services":{"database":"healthy","rpc":"healthy"}}
```

### 2.2 Contract State Verification

**After contract deployment/upgrade**:

```bash
# Verify admin is correct
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- admin
# Expected: <YOUR_ADMIN_PUBLIC_KEY>

# Verify schema version
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- schema_version
# Expected: 1 (or your target version)

# Verify contract not paused
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- is_paused
# Expected: false

# Check total supply (should not be 0 if users exist)
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- total_supply
# Expected: positive number
```

### 2.3 End-to-End Smoke Test

**Run this test flow after major deployments**:

```bash
# Test 1: Create campaign via API
curl -X POST https://trivela.com/api/v1/campaigns \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Smoke Test Campaign",
    "slug": "smoke-test-'$(date +%s)'",
    "description": "Automated smoke test",
    "rewardPerAction": 100,
    "active": true
  }'
# Should return: 201 Created with campaign object

# Test 2: Retrieve campaign
curl https://trivela.com/api/v1/campaigns | jq '.campaigns | length'
# Should return: number > 0

# Test 3: Frontend loads
curl -f https://trivela.com/ | grep "Trivela"
# Should return: 0 (grep found the string)

# Test 4: Contract read operation
stellar contract invoke \
  --id <CAMPAIGN_CONTRACT_ID> \
  --network mainnet \
  -- get_campaign_count
# Should return: number >= 0
```

---

## 3. Monitoring & Alerting

### 3.1 Key Metrics to Monitor

**Backend Metrics** (via `/metrics` Prometheus endpoint):

- `http_request_duration_seconds` - API latency (p50, p95, p99)
- `http_requests_total` - Request rate and status codes
- `stellar_rpc_errors_total` - RPC failure count
- `database_query_duration_seconds` - DB performance
- `active_connections` - Connection pool health

**Contract Metrics** (via event indexer):

- `contract_credit_events_total` - Points credited
- `contract_claim_events_total` - Points claimed
- `contract_error_events_total` - Contract errors
- `contract_gas_used` - Gas consumption trends

**Infrastructure Metrics**:

- CPU usage per pod (target: < 80%)
- Memory usage per pod (target: < 85%)
- Pod restart count (target: 0 restarts/hour)
- Disk usage (target: < 80%)

### 3.2 Alert Thresholds

**Critical Alerts** (page on-call immediately):

- Health endpoint down for >2 minutes
- Error rate >5% for >5 minutes
- RPC connection failures >10/minute
- Database connection pool exhausted
- Contract admin key compromise detected
- Any pod crash loop (>3 restarts in 10 min)

**Warning Alerts** (notify Slack, no page):

- API latency p99 >2 seconds for >10 minutes
- Error rate >1% for >10 minutes
- Disk usage >75%
- CPU usage >80% for >15 minutes
- Rate limit triggers >100/minute (possible attack)

### 3.3 Monitoring Dashboard Setup

**Grafana Dashboard Panels** (import `monitoring/grafana-dashboard.json`):

1. **Overview**: Health status, active users, request rate
2. **API Performance**: Latency heatmap, error rate timeline
3. **Contract Activity**: Credits/claims per hour, gas usage
4. **Infrastructure**: CPU/memory/disk per pod, network I/O
5. **Database**: Query performance, connection pool, slow queries

**Alert Channels**:

- **PagerDuty**: Critical alerts only
- **Slack #trivela-alerts**: All alerts
- **Email**: Daily digest of warnings
- **Webhook**: https://trivela.com/api/internal/alerts

### 3.4 Log Aggregation

**Centralized Logging** (Loki, Elasticsearch, or CloudWatch):

```bash
# Query backend errors (last 1 hour)
kubectl logs -l app=trivela-backend -n trivela-prod --since=1h | grep ERROR

# Query contract invocation logs
kubectl logs -l app=trivela-backend -n trivela-prod --since=30m | grep "contract invoke"

# Query rate limit violations
kubectl logs -l app=trivela-backend -n trivela-prod --since=15m | grep "429"
```

**Log Retention**:

- Application logs: 30 days
- Audit logs (admin actions): 1 year
- Access logs: 90 days

---

## 4. Rollback Procedures

### 4.1 Backend Rollback

**When**: Critical bug, performance regression, data corruption

**Time to Execute**: ~2 minutes

```bash
# Emergency rollback to BLUE environment
./scripts/deploy-blue-green.sh blue

# Verify traffic switched
kubectl logs -l app=trivela-backend-blue -n trivela-prod --tail=10 | grep "GET /health"

# Scale up BLUE if needed
kubectl scale deployment/trivela-backend-blue --replicas=3 -n trivela-prod

# Verify health
curl -f https://trivela.com/health
```

### 4.2 Contract Rollback

**⚠️ WARNING**: Contract rollbacks are complex due to immutable on-chain state

**Option A: Roll back WASM only** (state preserved):

```bash
# Get previous WASM hash from git history
git log --all --grep="contract: deploy" --oneline | head -5

# Re-upload previous WASM
stellar contract install \
  --wasm target/wasm32-unknown-unknown/release/trivela_rewards_contract_v1.2.3.wasm \
  --network mainnet \
  --source trivela-admin
# Output: <OLD_WASM_HASH>

# Downgrade contract
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- upgrade \
  --admin <ADMIN_PUBLIC_KEY> \
  --nonce <CURRENT_NONCE> \
  --new_wasm_hash <OLD_WASM_HASH>
```

**Option B: Deploy fresh contract + migrate state** (last resort):

1. Deploy new contract instance with old WASM
2. Pause old contract (`set_paused`)
3. Snapshot user balances via event indexer
4. Re-credit balances to new contract
5. Update frontend/backend to point to new contract ID
6. **Only use if WASM rollback fails**

**Time to Execute**: 10-60 minutes depending on state size

### 4.3 Frontend Rollback

```bash
# Re-deploy previous git tag
git checkout v2024.01.14
cd frontend && npm run build

# Upload to S3/CDN
aws s3 sync dist/ s3://trivela-frontend-prod/ --delete
aws cloudfront create-invalidation --distribution-id E1234567890ABC --paths "/*"

# Verify
curl -I https://trivela.com/ | grep "x-version"
```

**Time to Execute**: ~5 minutes (+ CDN propagation)

### 4.4 Database Rollback

**When**: Schema migration breaks production

```bash
# Option 1: Revert migration (if supported)
cd backend
npm run db:migrate:undo

# Option 2: Restore from backup
# Assumes daily automated backups to S3
aws s3 cp s3://trivela-db-backups/trivela_prod_2024-01-14.sql.gz .
gunzip trivela_prod_2024-01-14.sql.gz
psql $DATABASE_URL < trivela_prod_2024-01-14.sql

# Verify restore
psql $DATABASE_URL -c "SELECT COUNT(*) FROM campaigns;"
```

**⚠️ Data Loss Risk**: Restoring backups loses all data created after backup timestamp

**Time to Execute**: 5-30 minutes depending on DB size

---

## 5. Incident Response

### 5.1 Incident Severity Levels

| Severity  | Definition              | Response Time | Example                              |
| --------- | ----------------------- | ------------- | ------------------------------------ |
| **SEV-1** | Complete service outage | Immediate     | Site down, database offline          |
| **SEV-2** | Major feature broken    | <30 minutes   | Contract calls failing, auth broken  |
| **SEV-3** | Minor degradation       | <2 hours      | Slow API, non-critical feature issue |
| **SEV-4** | Cosmetic issue          | <24 hours     | UI glitch, typo in docs              |

### 5.2 SEV-1 Incident Response

**IMMEDIATE ACTIONS** (first 5 minutes):

1. **Alert team**: Post in #incident-response Slack
2. **Assign IC**: Incident Commander coordinates response
3. **Create status page**: Update https://status.trivela.com
4. **Gather logs**: `kubectl logs` from all failing pods

**TRIAGE** (minutes 5-15):

```bash
# Check pod status
kubectl get pods -n trivela-prod
kubectl describe pod <failing-pod> -n trivela-prod

# Check recent deployments
kubectl rollout history deployment/trivela-backend-green -n trivela-prod

# Check RPC health
curl -f $SOROBAN_RPC_URL/health

# Check database
psql $DATABASE_URL -c "SELECT 1;"
```

**MITIGATION OPTIONS** (minutes 15-30):

1. **Rollback deployment** (preferred): See §4.1, §4.2, §4.3
2. **Scale to zero and redeploy**: `kubectl scale deployment/trivela-backend-green --replicas=0`
3. **Enable maintenance mode**: Update ingress to serve static "Under Maintenance" page
4. **Disable problematic feature**: Use feature flags in backend

**COMMUNICATION** (every 15 minutes):

- Update status page with current status
- Post to #trivela-users in Discord/Slack
- Email major customers if SLA breach likely

**POST-INCIDENT** (within 24 hours):

- Write postmortem ([template](./POSTMORTEM_TEMPLATE.md))
- Identify action items to prevent recurrence
- Schedule blameless retrospective

---

## 6. Common Operations

### 6.1 Admin Key Rotation

**When**: Every 90 days (security best practice) or on suspected compromise

```bash
# Step 1: Generate new admin keypair
stellar keys generate trivela-admin-v2 --network mainnet

# Step 2: Propose new admin on all contracts
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- propose_admin \
  --current_admin <OLD_ADMIN_KEY> \
  --new_admin <NEW_ADMIN_KEY>

# Step 3: Accept admin from new keypair
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin-v2 \
  -- accept_admin \
  --new_admin <NEW_ADMIN_KEY>

# Step 4: Verify
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin-v2 \
  -- admin
# Should return: <NEW_ADMIN_KEY>

# Step 5: Update secrets manager
# Update STELLAR_SECRET_KEY in production environment
# Rotate API keys if admin key was used for auth
```

### 6.2 Database Backup & Restore

**Automated Daily Backups** (configured in Kubernetes CronJob):

```yaml
# k8s/cronjob-db-backup.yaml
schedule: '0 2 * * *' # 2 AM UTC daily
command: |
  pg_dump $DATABASE_URL | gzip > /backup/trivela_prod_$(date +%Y-%m-%d).sql.gz
  aws s3 cp /backup/trivela_prod_$(date +%Y-%m-%d).sql.gz s3://trivela-db-backups/
```

**Manual Backup**:

```bash
# Full backup
pg_dump $DATABASE_URL | gzip > trivela_backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Upload to S3
aws s3 cp trivela_backup_*.sql.gz s3://trivela-db-backups/manual/
```

**Restore from Backup**:

```bash
# Download latest backup
aws s3 cp s3://trivela-db-backups/trivela_prod_2024-01-15.sql.gz .
gunzip trivela_prod_2024-01-15.sql.gz

# Restore (⚠️ DESTRUCTIVE - drops existing data)
psql $DATABASE_URL < trivela_prod_2024-01-15.sql

# Verify restoration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM campaigns;"
psql $DATABASE_URL -c "SELECT MAX(created_at) FROM campaigns;" # Should match backup date
```

### 6.3 Scale Operations

**Scale Up** (high traffic expected):

```bash
# Backend
kubectl scale deployment/trivela-backend-green --replicas=10 -n trivela-prod

# Frontend (if serving from pods, not CDN)
kubectl scale deployment/trivela-frontend --replicas=5 -n trivela-prod

# Database connections (adjust in backend env)
export DATABASE_POOL_MAX=50 # up from 20
kubectl set env deployment/trivela-backend-green DATABASE_POOL_MAX=50 -n trivela-prod
```

**Scale Down** (maintenance window):

```bash
kubectl scale deployment/trivela-backend-green --replicas=1 -n trivela-prod
```

### 6.4 Emergency Pause Contract

**When**: Critical contract bug detected, exploit in progress, or coordinated vulnerability
disclosure

```bash
# Pause all contract operations immediately
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- set_paused \
  --admin <ADMIN_PUBLIC_KEY> \
  --nonce 0 \
  --paused true \
  --signatures []

# Verify paused
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  -- is_paused
# Should return: true

# Unpause after fix deployed
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin \
  -- set_paused \
  --admin <ADMIN_PUBLIC_KEY> \
  --nonce 1 \
  --paused false \
  --signatures []
```

**⚠️ User Impact**: All credit/claim operations will fail while paused

**Communication**: Update status page immediately, notify users via all channels

### 6.5 Clear Rate Limit (Emergency)

**When**: Legitimate user/API key hit rate limit incorrectly

```bash
# If using Redis
redis-cli DEL "rate:$API_KEY:$WINDOW"

# If using in-memory store (requires pod restart)
kubectl delete pod -l app=trivela-backend-green -n trivela-prod
```

---

## 7. Emergency Contacts

### 7.1 On-Call Rotation

| Week    | Primary         | Secondary       | Backup          |
| ------- | --------------- | --------------- | --------------- |
| Current | Check PagerDuty | Check PagerDuty | Check PagerDuty |

**PagerDuty**: https://trivela.pagerduty.com/schedules

### 7.2 Escalation Path

1. **On-call engineer** (responds within 15 minutes)
2. **Tech lead** (if on-call engineer unavailable)
3. **CTO** (for SEV-1 lasting >1 hour)

### 7.3 External Contacts

- **Stellar Foundation**: support@stellar.org (RPC issues)
- **Hosting Provider**: support@ (infrastructure outages)
- **Security Auditor**: audit@... (security incidents)

---

## 8. Runbook Maintenance

**Review Schedule**: Quarterly (every 3 months)

**Update Triggers**:

- After each SEV-1/SEV-2 incident
- After infrastructure changes
- When new features require operational procedures

**Owners**:

- Primary: DevOps team
- Reviewers: Backend team, Security team

**Last Updated**: 2024-01-15 **Next Review**: 2024-04-15

---

## References

- [MAINNET_DEPLOY.md](./MAINNET_DEPLOY.md) - Full deployment guide
- [MAINNET_CHECKLIST.md](./MAINNET_CHECKLIST.md) - Launch readiness checklist
- [SECURITY.md](../SECURITY.md) - Security policies and incident reporting
- [KUBERNETES.md](./KUBERNETES.md) - Kubernetes configuration reference
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Blue-green deployment details

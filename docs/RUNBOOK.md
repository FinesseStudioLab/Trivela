# Operations Runbook

## Blue/Green Deployment Rollback

This runbook describes how to recover from a failed blue/green deployment.

### When to roll back

Roll back when any of the following occur after switching traffic to green:

- `GET /health` on the green container returns a non-200 status.
- Error rate in green logs exceeds zero within the 30-second verification window.
- Manual monitoring detects elevated error rates or latency after the switch.
- The automated `deploy-blue-green.sh` script exits with a non-zero status.

### Automated rollback

The deployment script performs an automatic rollback on failure. No manual intervention is needed if
the script is still running. The script will:

1. Rewrite the nginx upstream to point back to blue.
2. Reload nginx (`nginx -s reload`).
3. Stop the green container.
4. Exit with status 1 and print the failure reason.

### Manual rollback procedure

If the automated rollback fails or you need to intervene manually:

```bash
# 1. Restore nginx upstream to blue (port 3001)
export TRIVELA_BACKEND_HOST=blue
export TRIVELA_BACKEND_PORT=3001
envsubst '${TRIVELA_BACKEND_HOST} ${TRIVELA_BACKEND_PORT}' \
  < nginx/trivela.conf.template \
  > /etc/nginx/conf.d/trivela.conf

# 2. Reload nginx
nginx -s reload
# or in Docker:
docker compose exec nginx nginx -s reload

# 3. Verify blue is serving traffic
curl -sf http://localhost/health && echo "blue is healthy"

# 4. Stop the green container
docker compose --profile green stop backend-green
# or remove it:
docker compose --profile green rm -f backend-green
```

### Verifying the rollback

After rollback, confirm:

```bash
# Health check passes
curl -sf http://localhost/health | jq .

# Nginx is pointing at blue
docker compose exec nginx nginx -T | grep "server blue"

# Green container is stopped
docker compose ps backend-green
```

### Post-rollback actions

1. Check green container logs for the root cause:
   ```bash
   docker compose --profile green logs backend-green --tail 200
   ```
2. File an incident report with: timestamp, failure reason, rollback duration.
3. Fix the issue in the new image before attempting another deployment.

## Health Check Failures

If `/health` returns non-200 or times out:

1. Check container status: `docker compose ps`
2. Check logs: `docker compose logs backend --tail 100`
3. Verify environment variables are set correctly.
4. Check database connectivity:
   `docker compose exec backend node -e "import(./src/db.js).then(m => m.default.ping())"`
5. If the container is in a crash loop, increase `max_retries` or fix the underlying issue before
   redeploying.

## Rate Limit Incidents

If the API returns 429 responses unexpectedly:

1. Check current Redis state (if Redis is enabled):
   ```bash
   docker compose exec redis redis-cli info stats | grep keyspace
   ```
2. Adjust `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS` in the environment and restart the
   backend.
3. For immediate relief, restart the backend container to flush the in-memory limiter (only
   effective when Redis is not in use).

## Auth Brute-Force Lockout

Triggered by the `AuthFailureSpike` / `AuthLockoutTriggered` alerts, or a surge in
`trivela_auth_failures_total` / `trivela_auth_lockouts_total` on `/metrics`. The backend
progressively delays and then temporarily locks out (HTTP 429, `code: AUTH_LOCKED_OUT`) clients that
repeatedly fail authentication on a guarded route.

1. Identify the offending source(s). Lockout/failure events are logged at `warn` with the keyed
   client, e.g.:
   ```bash
   docker compose logs backend --tail 500 | grep -E "Authentication lockout|Failed authentication"
   ```
2. If the traffic is malicious, block the source IP(s) at the edge (nginx / load balancer / WAF) so
   it never reaches the app.
3. If a legitimate integrator is locked out (e.g. a rotated/expired key), have them fix their
   credentials; the lockout self-clears after the back-off window, or restart the backend to flush
   the in-memory lockout state immediately.
4. Tune thresholds via `AUTH_LOCKOUT_SOFT_THRESHOLD`, `AUTH_LOCKOUT_HARD_THRESHOLD`, and
   `AUTH_LOCKOUT_BASE_MS` if the defaults are too aggressive/lenient, then restart the backend.

## Database Migration Failures

If `npm run db:migrate` fails during deployment:

1. Restore from the most recent database snapshot before attempting the migration again.
2. Review the failing migration file in `backend/src/db/migrations/`.
3. If using PostgreSQL, connect with `psql` and inspect the migration state table.
4. Do **not** delete migration files — mark them as rolled back in the state table if needed.

## Database Backup & Restore

### RTO / RPO Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| **RPO** (Recovery Point Objective) | ≤ 24 hours | Daily automated backups at 02:00 UTC |
| **RTO** (Recovery Time Objective) | ≤ 30 minutes | pg_restore + smoke test suite |

### Automated Backups

Backups run daily via the `k8s/cronjob-db-backup.yaml` CronJob or can be triggered manually:

```bash
# Manual backup (PostgreSQL)
DATABASE_URL="postgresql://trivela_user:password@localhost:5432/trivela_db" \
STORAGE_BACKEND=local \
./scripts/backup-db.sh

# Manual backup to S3 with encryption
DATABASE_URL="postgresql://..." \
STORAGE_BACKEND=s3 \
S3_BUCKET=trivela-backups \
BACKUP_ENCRYPTION_KEY=./backup-key.pub \
./scripts/backup-db.sh
```

Each backup produces:
- A compressed `pg_dump` in custom format (`.dump.gz`)
- A `manifest.json` with checksum, schema version, and indexer cursor
- Optional age encryption (`.age` suffix)

### Retention Policy

| Retention | Default | Configurable via |
|-----------|---------|-----------------|
| Daily | 7 days | `BACKUP_RETENTION_DAILY` |
| Weekly | 4 weeks | `BACKUP_RETENTION_WEEKLY` |
| Monthly | 6 months | `BACKUP_RETENTION_MONTHLY` |

Old backups are pruned automatically by the backup script.

### Restore Procedure

```bash
# 1. Identify the latest backup
ls -la backups/2025/06/27/

# 2. Restore from backup
DATABASE_URL="postgresql://trivela_user:password@localhost:5432/trivela_db" \
BACKUP_DECRYPTION_KEY=./backup-key.txt \
SMOKE_TEST_ENABLED=true \
./scripts/restore-db.sh backups/2025/06/27/trivela-backup-20250627T020000Z.dump.gz.age

# 3. For S3 backups
DATABASE_URL="postgresql://..." \
./scripts/restore-db.sh s3://trivela-backups/backups/2025/06/27/trivela-backup-20250627T020000Z.dump.gz
```

The restore script performs:
1. Checksum verification (if `.sha256` file present)
2. Decryption (if `BACKUP_DECRYPTION_KEY` provided)
3. Decompression and `pg_restore --clean --if-exists`
4. Indexer cursor inspection
5. Smoke queries against `campaigns`, `audit_logs`, `api_keys`, `_schema_migrations`

### Verify Backup Integrity

```bash
# Generate checksum for an existing backup
sha256sum backup.dump.gz > backup.dump.gz.sha256

# Verify checksum
echo "$(cat backup.dump.gz.sha256)  backup.dump.gz" | sha256sum -c -
```

### Restore Drill (Staging)

Run an automated restore drill in staging/CI:

```bash
# 1. Restore latest backup into a throwaway database
createdb trivela_restore_drill
DATABASE_URL="postgresql://trivela_user:password@localhost:5432/trivela_restore_drill" \
./scripts/restore-db.sh <latest-backup-path>

# 2. Run smoke test suite
DATABASE_URL="postgresql://trivela_user:password@localhost:5432/trivela_restore_drill" \
SMOKE_TEST_ENABLED=true \
./scripts/restore-db.sh <latest-backup-path>  # Already runs smoke tests

# 3. Drop the throwaway database
dropdb trivela_restore_drill
```

### Emergency: Restore Without Backup Script

If the restore script is unavailable, manual steps:

```bash
# Decompress
gunzip -k trivela-backup.dump.gz

# Restore
pg_restore --clean --if-exists --no-owner \
  --dbname "postgresql://trivela_user:password@localhost:5432/trivela_db" \
  trivela-backup.dump

# Verify schema
psql "$DATABASE_URL" -c "SELECT version, description FROM _schema_migrations ORDER BY version DESC LIMIT 5;"

# Verify data
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM campaigns;"
```

### k8s Backup CronJob

The backup CronJob runs in the `trivela` namespace:

```bash
# Check CronJob status
kubectl get cronjob trivela-db-backup -n trivela

# Trigger a manual backup job
kubectl create job --from=cronjob/trivela-db-backup trivela-db-backup-manual-$(date +%s) -n trivela

# Check job logs
kubectl logs job/trivela-db-backup-manual-xxx -n trivela
```

Required secrets for the CronJob:
- `trivela-secrets.DATABASE_URL` — PostgreSQL connection string
- `trivela-secrets.S3_BACKUP_BUCKET` — S3 bucket (if using S3)
- `trivela-secrets.BACKUP_ENCRYPTION_PUBKEY` — age public key (optional)
# Trivela Runbook

Operational procedures for the Trivela backend and infrastructure.

---

## Secret Rotation Procedure

If a private key, API key, or other secret is accidentally committed to the repository, follow these steps immediately.

### 1. Assess the exposure

- Determine what was committed: Stellar secret key, Trivela API key, environment variable, or third-party credential.
- Check if the commit reached GitHub (even briefly) — assume it did and treat it as compromised.

### 2. Revoke / rotate the secret immediately

| Secret type | Rotation action |
|---|---|
| Stellar secret key | Generate a new keypair. If the key held on-chain funds, sweep them to a new address first. |
| Trivela API key | Call `DELETE /api/v1/admin/api-keys/:id` to revoke the old key, then create a new one. |
| Third-party credential | Follow the provider's key rotation procedure. |

Do **not** wait until the commit is removed before revoking — assume the secret is already exploited.

### 3. Remove the secret from git history

Use `git filter-repo` (preferred) or BFG Repo Cleaner to rewrite history:

```bash
# Install: pip install git-filter-repo
git filter-repo --path-regex '.*' --replace-text <(echo 'COMPROMISED_VALUE==>REDACTED')
```

Then force-push all branches and tags. Coordinate with other contributors to re-clone.

### 4. Request a GitHub secret scan review

Open a GitHub support ticket to purge cached views of the exposed commit, and enable [GitHub's secret scanning alerts](https://docs.github.com/en/code-security/secret-scanning) if not already on.

### 5. Post-incident

- Add a custom rule to `.gitleaks.toml` for the leaked pattern if it is not already covered.
- Update `scripts/dev-setup.sh` if a `git-secrets` pattern needs to be added locally.
- Write a brief incident summary and share it with the team.

---

## Gitleaks CI Failures

If the `Secrets Scanning` CI workflow fails on a PR:

1. **Do not merge** until the finding is resolved.
2. Read the workflow output to see which file/line triggered the rule (the secret value itself is not printed).
3. If it is a **false positive**, add an `[allowlist]` entry in `.gitleaks.toml` for that path or pattern, and explain why in the PR.
4. If it is a **real secret**, follow the rotation procedure above before amending the commit.

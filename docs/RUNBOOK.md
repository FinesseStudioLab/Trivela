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

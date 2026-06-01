# Deployment & Restart Policy Guidance

## Docker Healthcheck

The backend container includes a healthcheck that monitors the `/health` endpoint. The healthcheck:
- Probes every 30 seconds
- Waits up to 3 seconds for a response
- Allows 5 seconds after startup before considering the container unhealthy
- Marks the container unhealthy after 3 consecutive failed checks

A healthy container returns `{"status": "ok"}` from `GET /health`. Any other status or timeout marks the container as unhealthy.

## Restart Policies

Choose a restart policy appropriate for your deployment platform:

### Docker Compose

```yaml
services:
  backend:
    build: .
    restart_policy:
      condition: on-failure
      max_retries: 3
      delay: 5s
```

This restarts the container on non-zero exit or unhealthy status, with a 5-second delay between attempts and a max of 3 retries.

### Kubernetes

```yaml
spec:
  containers:
    - name: backend
      image: trivela-backend:latest
      livenessProbe:
        httpGet:
          path: /health
          port: 3001
        initialDelaySeconds: 10
        periodSeconds: 30
        timeoutSeconds: 3
        failureThreshold: 3
  restartPolicy: Always
```

This uses the built-in healthcheck via liveness probe and restarts the pod on failure.

### Docker Swarm

```yaml
version: '3.8'
services:
  backend:
    image: trivela-backend:latest
    deploy:
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
```

Similar to Docker Compose, restarts on failure with exponential backoff.

## Blue/Green Deployment

Blue/green deployment eliminates downtime by running two identical backend
environments in parallel and atomically switching traffic only after the new
environment is verified healthy.

### Overview

| Colour | Role |
|--------|------|
| **blue** | Currently serving production traffic |
| **green** | New version under validation |

The load balancer (nginx) maintains an `upstream trivela_backend` block that
points to whichever colour is active. Switching traffic is a single nginx
reload — no DNS changes, no downtime.

### Environments

Both environments are identical in configuration. They differ only in port:

| Environment | Internal Port |
|-------------|---------------|
| blue        | 3001          |
| green       | 3002          |

### Deployment steps

1. **Build** the new image and tag it `trivela-backend:green`.
2. **Start green** alongside blue:
   ```bash
   docker compose --profile green up -d backend-green
   ```
3. **Poll `/health`** on the green container (max 60 s):
   ```bash
   ./scripts/deploy-blue-green.sh
   ```
4. The script updates the nginx upstream to point at green and reloads nginx.
5. After 30 s the script checks green logs for errors. If none are found it
   stops the blue container.
6. On any failure the script rolls back by switching nginx back to blue and
   stopping green.

### Nginx upstream template

The nginx config uses an `upstream` block so the active backend can be
changed with a single variable substitution and reload:

```nginx
upstream trivela_backend {
    server ${TRIVELA_BACKEND_HOST}:${TRIVELA_BACKEND_PORT};
}
```

At switch time `deploy-blue-green.sh` writes the correct host/port into
`nginx/trivela.conf` and runs `nginx -s reload`.

### Rollback

If the green environment fails health checks or log scanning finds errors:

1. nginx upstream is reverted to blue.
2. nginx is reloaded.
3. The green container is stopped.
4. The operator is notified via the script exit code (non-zero).

See [RUNBOOK.md](./RUNBOOK.md) for full rollback procedures.

## Admin key management (2-step transfer)

Both the `rewards` and `campaign` contracts use a **propose-then-accept** admin
rotation pattern to eliminate the "keyed-in wrong address, key is now lost"
failure mode of a one-step `set_admin` call.

### Read functions

- `admin() -> Address` — the current admin.
- `pending_admin() -> Option<Address>` — the admin proposed but not yet
  accepted. `None` when no transfer is in flight.

### Rotation flow

1. **Current admin** calls `propose_admin(current_admin, new_admin)`. The
   admin slot is **not** updated yet; the address goes into `pending_admin`.
   The current admin can call `propose_admin` again with a different address
   to amend the proposal, or call `cancel_admin_transfer` to drop it
   entirely.
2. **New admin** calls `accept_admin(new_admin)` from their own wallet. The
   call's `require_auth` proves the new admin actually controls the key. On
   success the admin slot is updated and `pending_admin` is cleared.

Until step 2 happens the existing admin retains full control, so a typo in
step 1 cannot brick the contract.

### Operator checklist before rotation

- [ ] Generate the new admin keypair on the target signer (hardware wallet,
      multisig, etc.). Do **not** copy the secret over the wire.
- [ ] Test the new keypair can sign a no-op transaction on the same network.
- [ ] Call `propose_admin` from the current admin and confirm the
      `aproposed` event fires with the expected `new_admin` address.
- [ ] Call `accept_admin` from the new admin keypair within 30 days (the
      instance-storage TTL).
- [ ] Verify `admin()` returns the new address and `pending_admin()` returns
      `None`.


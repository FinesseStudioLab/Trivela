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

## Admin key management (2-step transfer)

Both the `rewards` and `campaign` contracts use a **propose-then-accept** admin
rotation pattern (issue #281) to eliminate the "keyed-in wrong address, key is
now lost" failure mode of a one-step `set_admin` call.

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
      instance-storage TTL — see [`TTL_STRATEGY.md`](./TTL_STRATEGY.md)).
      A failed acceptance can be retried as long as the proposal is still
      live.
- [ ] Verify `admin()` returns the new address and `pending_admin()` returns
      `None`.

### Why not full N-of-M multisig?

A full threshold multisig inside the contract would require significantly more
state, careful nonce handling, and per-call signature aggregation logic. The
2-step transfer pattern delivers most of the safety upside (no single-typo
loss of control, no rushed rotation, clean event trail) with low complexity
overhead, and it composes naturally with a future governance contract that
acts as the admin address.

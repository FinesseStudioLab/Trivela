# Chaos Engineering Harness (#784)

This directory contains fault-injection tooling for Trivela's backend and smart-contract layer. The
goal is to verify that the system degrades gracefully — rather than catastrophically — when
individual dependencies fail.

## Quick start

```bash
# Run a single fault scenario (requires Docker Compose to be up):
bash chaos/inject.sh network-partition-backend

# List available scenarios:
bash chaos/inject.sh --list

# Restore to a healthy state after any scenario:
bash chaos/inject.sh restore
```

## Available scenarios

| Scenario name               | What it simulates                                        |
| --------------------------- | -------------------------------------------------------- |
| `network-partition-backend` | Drops all outbound traffic from the backend container    |
| `db-latency`                | Adds 500 ms of artificial latency to the SQLite volume   |
| `webhook-endpoint-down`     | Blocks outbound HTTP on port 443 from the backend        |
| `stellar-rpc-timeout`       | Intercepts Stellar RPC calls with a 30 s delay via proxy |
| `outbox-relay-kill`         | Sends SIGKILL to the outbox relay worker process         |
| `high-cpu`                  | Spawns a CPU hog in the backend container for 60 s       |

## How it works

`inject.sh` uses `docker exec` and `tc` (Traffic Control) to apply kernel-level network shaping
inside the target container. This requires:

- `NET_ADMIN` capability on the container (enabled in `compose.yaml` for chaos targets via the
  `cap_add` key).
- The `iproute2` package inside the container (`tc` command).

For persistent / VM deployments the same `tc` commands work directly on the host interface; adjust
`INTERFACE` in `inject.sh`.

## Writing new scenarios

1. Add a `case` block to the `inject.sh` switch statement.
2. Document it in the table above.
3. Add an assertion in `chaos/assert.sh` that verifies the expected graceful behaviour (e.g. outbox
   relay back-fills after network is restored).
